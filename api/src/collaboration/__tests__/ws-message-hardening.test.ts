import { describe, it, expect, vi } from 'vitest'
import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import { handleMessage, type MessageHandlerWs } from '../index.js'

/**
 * Risk mitigated: a client can send arbitrary bytes to the collaboration
 * WebSocket. Before this fix, a malformed frame, an unexpected message type,
 * or an oversized frame threw synchronously out of the 'message' listener as
 * an uncaught exception, crashing the Node process. shipshapesec flagged this
 * as 3 CRITICAL WebSocket-validation findings (malformed / oversized / unknown
 * type each producing an abnormal 1006 close or a server crash).
 *
 * The fix wraps decode + dispatch in handleMessage: bad input now closes the
 * socket with a deliberate RFC 6455 policy code and never throws. These tests
 * pin that contract so a future refactor can't silently reintroduce the crash.
 */
const WS_CLOSE_PROTOCOL_ERROR = 1002
const WS_CLOSE_UNSUPPORTED_DATA = 1003

function mockWs(): MessageHandlerWs & { close: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> } {
  return { close: vi.fn(), send: vi.fn() }
}

function freshDocAndAwareness(): { doc: Y.Doc; aw: awarenessProtocol.Awareness } {
  const doc = new Y.Doc()
  const aw = new awarenessProtocol.Awareness(doc)
  return { doc, aw }
}

describe('WebSocket message hardening (mitigates shipshapesec WS criticals)', () => {
  it('closes with protocol-error (1002) on an undecodable frame, without throwing', () => {
    const ws = mockWs()
    const { doc, aw } = freshDocAndAwareness()
    // Empty buffer: readVarUint has no bytes to read and throws at the header.
    expect(() => handleMessage(ws, new Uint8Array([]), doc, aw, new Map())).not.toThrow()
    expect(ws.close).toHaveBeenCalledWith(WS_CLOSE_PROTOCOL_ERROR, expect.any(String))
  })

  it('closes with unsupported-data (1003) on an unexpected message type', () => {
    const ws = mockWs()
    const { doc, aw } = freshDocAndAwareness()
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, 99) // not sync(0) or awareness(1)
    expect(() => handleMessage(ws, encoding.toUint8Array(enc), doc, aw, new Map())).not.toThrow()
    expect(ws.close).toHaveBeenCalledWith(WS_CLOSE_UNSUPPORTED_DATA, expect.any(String))
  })

  it('closes with protocol-error (1002) on a valid header followed by a malformed body', () => {
    const ws = mockWs()
    const { doc, aw } = freshDocAndAwareness()
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, 0) // messageSync header is fine...
    const arr = encoding.toUint8Array(enc)
    // ...but a trailing continuation byte makes the inner sync decode read
    // past the buffer and throw. The handler must catch it.
    const malformed = new Uint8Array([...arr, 0x80])
    expect(() => handleMessage(ws, malformed, doc, aw, new Map())).not.toThrow()
    expect(ws.close).toHaveBeenCalledWith(WS_CLOSE_PROTOCOL_ERROR, expect.any(String))
  })

  it('processes a well-formed sync message without closing the socket', () => {
    const ws = mockWs()
    const { doc, aw } = freshDocAndAwareness()
    const enc = encoding.createEncoder()
    encoding.writeVarUint(enc, 0) // messageSync
    syncProtocol.writeSyncStep1(enc, doc)
    expect(() => handleMessage(ws, encoding.toUint8Array(enc), doc, aw, new Map())).not.toThrow()
    expect(ws.close).not.toHaveBeenCalled()
    // syncStep1 elicits a syncStep2 reply, so the server sends something back.
    expect(ws.send).toHaveBeenCalled()
  })
})
