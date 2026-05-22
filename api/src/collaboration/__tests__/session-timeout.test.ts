import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import WebSocket from 'ws'
import { pool } from '../../db/client.js'
import {
  revalidateWsSessions,
  WS_CLOSE_SESSION_EXPIRED,
  type ClosableWebSocketLike,
} from '../index.js'
import { SESSION_TIMEOUT_MS, ABSOLUTE_SESSION_TIMEOUT_MS } from '@ship/shared'

/**
 * Risk mitigated: A session that expires (or is destroyed by logout / admin
 * revoke) while a WebSocket connection is still open keeps accepting edits
 * via that WS — violating NIST AAL2's 15-minute inactivity timeout and
 * leaving a security & data-integrity hole. Phase 1 audit caught this live
 * (orientation/baselines/runtime-errors/evidence/ws-session-expiry.md).
 *
 * The fix in api/src/collaboration/index.ts adds a periodic re-validation
 * tick. These tests exercise the pure decision function (revalidateWsSessions)
 * against a fresh sessions row so the four expiry paths are pinned:
 *   1. session_missing     — session deleted from DB
 *   2. inactivity_timeout  — last_activity > 15 min ago
 *   3. absolute_timeout    — created_at > 12 h ago
 *   4. active session      — no close
 *
 * Each case asserts: (a) the close was issued with code 4401, (b) the reason
 * string matches, (c) active sessions are left alone.
 */
describe('WebSocket session timeout enforcement (Task 14, mitigates C-2)', () => {
  const testRunId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  let testUserId: string
  let testWorkspaceId: string

  beforeAll(async () => {
    const ws = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1) RETURNING id`,
      [`WS Timeout Test ${testRunId}`]
    )
    testWorkspaceId = ws.rows[0]!.id

    const u = await pool.query<{ id: string }>(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, 'test-hash', 'WS Timeout User') RETURNING id`,
      [`ws-timeout-${testRunId}@test.local`]
    )
    testUserId = u.rows[0]!.id
  })

  afterAll(async () => {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId])
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId])
    await pool.query('DELETE FROM workspaces WHERE id = $1', [testWorkspaceId])
  })

  // Build a mock WebSocket that satisfies ClosableWebSocketLike. close() records
  // its arguments so we can assert the close code and reason.
  function makeMockWs(): ClosableWebSocketLike & { closeCalls: Array<{ code: number; reason: string }> } {
    const closeCalls: Array<{ code: number; reason: string }> = []
    return {
      readyState: WebSocket.OPEN,
      close(code, reason) {
        closeCalls.push({ code, reason })
        this.readyState = WebSocket.CLOSING
      },
      closeCalls,
    }
  }

  it('closes a WS whose session row was deleted (session_missing)', async () => {
    const sessionId = `sess-missing-${testRunId}`
    // Intentionally no session row inserted

    const mockWs = makeMockWs()
    const conns = new Map<ClosableWebSocketLike, { sessionId: string }>([[mockWs, { sessionId }]])

    const closed = await revalidateWsSessions({
      conns,
      eventConns: new Map(),
      fetchSessions: async (ids) => {
        const result = await pool.query<{ id: string; last_activity: Date; created_at: Date }>(
          `SELECT id, last_activity, created_at FROM sessions WHERE id = ANY($1::text[])`,
          [ids]
        )
        return result.rows
      },
    })

    expect(closed).toEqual([{ sessionId, reason: 'session_missing' }])
    expect(mockWs.closeCalls).toEqual([{ code: WS_CLOSE_SESSION_EXPIRED, reason: 'session_missing' }])
    expect(WS_CLOSE_SESSION_EXPIRED).toBe(4401)
  })

  it('closes a WS whose session is past the 15-minute inactivity timeout', async () => {
    const sessionId = `sess-inactivity-${testRunId}`
    // Insert a session row with last_activity 16 minutes in the past
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, last_activity, created_at, expires_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '16 minutes', NOW() - INTERVAL '20 minutes', NOW() + INTERVAL '12 hours')`,
      [sessionId, testUserId, testWorkspaceId]
    )

    const mockWs = makeMockWs()
    const closed = await revalidateWsSessions({
      conns: new Map([[mockWs, { sessionId }]]),
      eventConns: new Map(),
      fetchSessions: async (ids) => {
        const result = await pool.query<{ id: string; last_activity: Date; created_at: Date }>(
          `SELECT id, last_activity, created_at FROM sessions WHERE id = ANY($1::text[])`,
          [ids]
        )
        return result.rows
      },
    })

    expect(closed).toHaveLength(1)
    expect(closed[0]).toEqual({ sessionId, reason: 'inactivity_timeout' })
    expect(mockWs.closeCalls[0]).toEqual({
      code: WS_CLOSE_SESSION_EXPIRED,
      reason: 'inactivity_timeout',
    })

    // Sanity-check that the constants match what we tested against
    expect(SESSION_TIMEOUT_MS).toBe(15 * 60 * 1000)
  })

  it('closes a WS whose session is past the 12-hour absolute timeout', async () => {
    const sessionId = `sess-absolute-${testRunId}`
    // Created 13 hours ago, last activity recent (so inactivity doesn't trigger first)
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, last_activity, created_at, expires_at)
       VALUES ($1, $2, $3, NOW() - INTERVAL '1 minute', NOW() - INTERVAL '13 hours', NOW() + INTERVAL '12 hours')`,
      [sessionId, testUserId, testWorkspaceId]
    )

    const mockWs = makeMockWs()
    const closed = await revalidateWsSessions({
      conns: new Map([[mockWs, { sessionId }]]),
      eventConns: new Map(),
      fetchSessions: async (ids) => {
        const result = await pool.query<{ id: string; last_activity: Date; created_at: Date }>(
          `SELECT id, last_activity, created_at FROM sessions WHERE id = ANY($1::text[])`,
          [ids]
        )
        return result.rows
      },
    })

    expect(closed[0]).toEqual({ sessionId, reason: 'absolute_timeout' })
    expect(ABSOLUTE_SESSION_TIMEOUT_MS).toBe(12 * 60 * 60 * 1000)
  })

  it('does NOT close a WS whose session is still active', async () => {
    const sessionId = `sess-active-${testRunId}`
    await pool.query(
      `INSERT INTO sessions (id, user_id, workspace_id, last_activity, created_at, expires_at)
       VALUES ($1, $2, $3, NOW(), NOW(), NOW() + INTERVAL '12 hours')`,
      [sessionId, testUserId, testWorkspaceId]
    )

    const mockWs = makeMockWs()
    const closed = await revalidateWsSessions({
      conns: new Map([[mockWs, { sessionId }]]),
      eventConns: new Map(),
      fetchSessions: async (ids) => {
        const result = await pool.query<{ id: string; last_activity: Date; created_at: Date }>(
          `SELECT id, last_activity, created_at FROM sessions WHERE id = ANY($1::text[])`,
          [ids]
        )
        return result.rows
      },
    })

    expect(closed).toEqual([])
    expect(mockWs.closeCalls).toEqual([])
    expect(mockWs.readyState).toBe(WebSocket.OPEN)
  })
})
