# Deep Dive — Real-time Collaboration (WebSockets + Yjs)

> Companion to `orientation/README.md §4 Real-time Collaboration`.
> Code to read: `api/src/collaboration/index.ts`, `api/src/collaboration/__tests__/`, the TipTap setup files in `web/src/components/`, and the `yjs_state` column on `documents`.

## The one-sentence mental model

**Two people edit the same TipTap document at the same time. They each emit small binary updates that converge to the same final document no matter what order those updates arrive in. That convergence is what a CRDT gives you, and Yjs is the CRDT.** The WebSocket is just a delivery mechanism; the correctness lives in the data type.

## Why this is conceptually hard

The naïve approach to multi-user editing — "each user sends their changes, the
server applies them in order" — falls apart the moment two users insert
characters at the same offset. User A types `X` at offset 5. User B types `Y`
at offset 5. Whose insert "wins"? If you apply A then B, B's insert ends up at
offset 6. If you apply B then A, A's insert ends up at offset 6. The two
clients diverge unless the server can canonically order *and* transform every
operation.

There are two well-known families of solution:

- **Operational Transformation (OT)** — what Google Docs uses. The server is
  authoritative; it transforms incoming ops against ops it has already
  applied. Conceptually simple in two-party cases, but the transformation
  functions get monstrous with rich text and the server must be online.
- **CRDTs (Conflict-free Replicated Data Types)** — the data structure is
  designed so that *any* order of merging produces the same result. No
  authoritative server needed for correctness. The cost is that the data
  structure carries extra metadata (each character has an ID, a deletion
  tombstone, a vector clock position, etc.).

**Ship uses Yjs, which is CRDT-based.** This is one of the strongest
architectural decisions in the codebase — the team delegated the hardest
correctness problem in collaborative editing to a well-tested library.

## What Yjs actually is

A Yjs document (`Y.Doc`) is a tree of CRDT types — `Y.Text`, `Y.Map`,
`Y.Array`, `Y.XmlFragment`, etc. TipTap stores its document as a
`Y.XmlFragment`. The CRDT property means:

1. Every operation produces a small **update** — a binary blob.
2. Updates are **commutative, associative, and idempotent**: applying the same
   set of updates in any order, any number of times, produces the same final
   state.
3. Clients exchange updates over any transport (WebSocket, WebRTC, polling).
4. The "state" of a doc can also be encoded as a single binary blob (a *state
   vector* + the merged history). That blob is what gets persisted server-side.

You don't have to understand the internals to use it correctly — but you do
have to understand point 4 to read this codebase.

## The Ship implementation, layer by layer

### Client (web/)

TipTap is the rich-text editor. Two TipTap extensions wire it to Yjs:

- `Collaboration` — binds the editor's content to a `Y.XmlFragment` inside a
  `Y.Doc`. Every edit produces a Yjs update.
- `CollaborationCursor` — broadcasts ephemeral state (cursor position, user
  identity, color) over the same connection.

The transport is `y-websocket` (or a custom equivalent — verify by reading
the client setup). When the editor mounts, it opens a WebSocket to the
collaboration server with a URL like `/collaboration/{docType}:{docId}` (per
the brief). The server then:

1. Sends the client the latest persisted state.
2. The client computes the diff between that state and its own, sends the
   missing updates back.
3. From then on, both sides exchange updates as they happen.

### Server (api/src/collaboration/)

The server runs on the same Express process (or attached to it via an HTTP
upgrade handler). For each room (`{docType}:{docId}`), it:

1. Loads the latest `yjs_state` blob from `documents`.
2. Maintains an in-memory `Y.Doc` per room.
3. Fans out incoming updates to every other connected client in the room.
4. Persists state back to Postgres on some cadence (every N updates, every T
   seconds, on last-client-disconnect, etc. — verify in code).

This is the file the audit should pay special attention to. Real-time servers
have a long list of failure modes:

- Persistence racing with disconnect (write lost).
- Persistence happening too often (DB hot row).
- Room leaks (Y.Doc not freed when last client disconnects).
- Broadcast loops (server echoes its own writes back).
- Auth bypass (anyone with a docId joins the room — does the server check?).

### Persistence

The `documents.yjs_state` column holds the binary CRDT state. There is *also*
a `documents.content` JSON column holding the TipTap JSON snapshot. These are
two representations of the same body. Snapshotting the JSON is what lets
non-collaborative reads (the API, search, exports) work without instantiating
a Y.Doc.

**Watch for:** the two columns drifting out of sync if the snapshot is
generated lazily and a non-collab write path forgets to update one of them.
That's an audit finding (category 6, runtime error handling).

## Server-as-truth, *except* for the document body

The architecture doc and `CLAUDE.md` both phrase this as **"Server is truth.
The app is offline-tolerant but server-authoritative."** Read it carefully:
the server is authoritative for *everything* — permissions, who's in what
project, whether a document exists — *except* for the document body, which is
governed by Yjs convergence. For the body, the server is essentially a relay
and a persistence backend, not an arbiter.

This split matters when you reason about failure modes:

| Situation | Resolved by |
|---|---|
| Two clients edit the same paragraph | Yjs convergence (client-driven, not server-driven) |
| Two clients try to delete the same document | Server (last write wins, or an error) |
| A client tries to write to a document they no longer have access to | Server (auth middleware on the upgrade) |
| A client comes back online after 10 minutes offline | Yjs sync — the local Y.Doc catches up by exchanging state vectors |

## Failure modes the audit should test

The brief's "Runtime Error and Edge Case Handling" category specifically
calls out collaboration. The script to follow:

1. **Open one document in two browser tabs.** Type in both. Confirm they
   converge.
2. **Disconnect one tab's WebSocket** (DevTools → Network → offline). Type in
   both. Reconnect the offline one. Confirm convergence again. **This is the
   single most important collab test.** Note exactly how long the reconnect
   takes and whether the UI gives the user any feedback during the offline
   window.
3. **Throttle to slow 3G.** Type fast. Does the UI feel sluggish or does it
   feel local-first (typing is instantaneous, sync happens in the background)?
4. **Kill and restart the server while two clients are connected.** Do they
   reconnect cleanly? Is any data lost?
5. **Simulate an unauthorized join.** Open the WebSocket directly with a doc
   ID you don't own. Does the server reject the upgrade or silently let you
   in?
6. **Long edit session, then reload.** Does the persisted state match what
   you typed? Confirm by comparing `documents.content` to the rendered editor
   after reload.
7. **Concurrent same-field edits.** Two users editing the same heading or
   title simultaneously — the title field may *not* be a Yjs type (it's a
   plain string), in which case last-write-wins applies and you'll lose
   keystrokes. This is a real finding if true; check the code.

## Why this is one of the strongest architectural decisions

A team that tries to build their own multi-user editor almost always
underestimates the problem and ships something subtly broken. Yjs is a
mature, well-tested CRDT library; delegating the convergence problem to it is
the right call for a 2-person team building a Notion-shaped product. When you
write the architecture-assessment section, this belongs in the "strongest
decisions" list, alongside the unified document model.

## Why it's also a likely source of the weakest points

Concretely:

- **The persistence cadence** is a knob with no obvious right setting. Too
  rare = data loss on crash. Too frequent = DB hot row.
- **The reconnect UX** is hand-rolled UI on top of `y-websocket`. It's a
  common place for spinners that never stop, or for silent failures where
  the user keeps typing but nothing is syncing.
- **The auth on the upgrade** is a custom integration of session cookies and
  the WebSocket upgrade — easy to get wrong, and rarely covered by E2E tests.

These are excellent audit targets. Document carefully — the implementation
phase wants "before/after proof," and these scenarios produce vivid
recordings.

## Glossary (for quick recall)

- **CRDT** — Conflict-free Replicated Data Type. Data structure whose merge
  function is commutative, associative, and idempotent.
- **Yjs** — A CRDT library for JavaScript. The CRDT Ship uses.
- **Y.Doc** — The root container. Holds Y.Text, Y.Map, etc.
- **Y.XmlFragment** — The CRDT type TipTap uses for its document tree.
- **State vector** — A compact summary of "what updates I've already seen."
  Used during sync to figure out which updates to send.
- **Update** — A binary blob representing one or more changes to a Y.Doc.
- **Awareness** — Ephemeral state (cursor positions, user presence) shared
  alongside the doc but not persisted. The `CollaborationCursor` extension
  rides on awareness.

## Cross-references

- `documents.yjs_state` is governed by all the unified-document-model rules
  (soft-delete, visibility, ACL) — see `unified-document-model.md`.
- The WebSocket upgrade goes through the same auth path as HTTP requests —
  see `request-flow-and-auth.md` §WebSocket Auth.
