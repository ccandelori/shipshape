# Cat 6 Runtime-Error Scenarios — Evidence Index

Captured 2026-05-19 (passes 1+2) and 2026-05-20 (pass 3, critical-review live runs) via `node orientation/baselines/runtime-errors/scenarios.mjs` against the live localhost stack (API :3000, web :5173 or :5174 — set `WEB=http://localhost:<port>` to match your stack). Driver script uses Playwright's `playwright` package (not the MCP — the MCP requires Chrome stable and the dev box has only the chromium-1200 cache). Every scenario writes a markdown evidence file plus a screenshot. Repro: `WEB=http://localhost:5173 node orientation/baselines/runtime-errors/scenarios.mjs only=1,2,3,3b,4,6,7,9,10` (sub-second feedback per scenario; ~120 s total for all 9).

## Scenarios captured live (Playwright Node script)

| # | Scenario | Live verdict | Evidence |
|---|---|---|---|
| 1 | WS session expiry mid-edit | ⚠️ **AUDIT CLAIM CONFIRMED LIVE (2026-05-20).** Playwright + `DELETE FROM sessions WHERE id = …` to force HTTP-session destruction. REST `/api/auth/me` returns **401** (HTTP boundary dead). Post-expiry phrase typed via the WS-bound editor; `documents.content` includes the post-expiry phrase — WS accepted and persisted edits from a destroyed session. | `ws-session-expiry.md` + `screenshots/ws-session-expiry.png` |
| 2 | yjsToJson silent NULL | ⚠️ **AUDIT CLAIM CONFIRMED LIVE (2026-05-20) via documented defect-injection-then-revert protocol.** The function as written never returns undefined, so reproduction required temporarily injecting a marker-conditioned `return undefined` branch. Run: `content IS NULL = t`, `octet_length(yjs_state) = 96`. Injection reverted via `git restore` immediately; no master diff. | `yjs-to-json-null.md` + `screenshots/yjs-to-json-null.png` |
| 3 | Disconnect during collab edit, then reconnect | ✅ **Converges.** All three typed phrases ('Online before drop', 'While offline', 'Reconnected') are present in the final body. Local Yjs accepted offline edits; y-websocket auto-reconnected; sync replayed both ways. No `"undefined"` placeholder. Live confirmation of the resilience path. | `disconnect-reconnect.md` + `screenshots/disconnect-reconnect-{offline,after}.png` |
| 3b | Two-tab concurrent title edit (PRD-required) | ✅ **Last-write-wins confirmed live (2026-05-20).** Two browser contexts as the same user, both filled the title with distinct values at the same instant. Persisted title was one of the two typed values (LWW holds). Both tabs PATCHed twice; later PATCH wins. **No UI signal to the losing tab** until reload — data-loss-on-reload UX is a Phase 2 candidate. | `two-tab-title-race.md` + `screenshots/two-tab-title-race-{A,B}.png` |
| 4 | Slow-3G page load | ⚠️ **Blank screen under 50 Kbps / 2000 ms latency.** At 3 s and 10 s of throttle, the body has 0 ProseMirror nodes, 0 skeletons, 0 visible spinners — the user sees a literal blank page. After throttle is released, the page renders normally (~5 s settle). Severity is moderated by federal users being on internal networks, but the gap is real — there are no skeleton states scoped to the document editor. | `slow-3g.md` + `screenshots/slow-3g-final.png` + `screenshots/slow-3g-3s.html` |
| 6 | Very long title (10 KB) | ⚠️ **Server rejects, client surfaces no inline error.** Direct `PATCH /api/documents/<id>` with `"A"×10000` returns **400 application/json** with body `{"error":"Invalid input","details":[{"code":"too_big","maximum":255,"type":"string","inclusive":true,"exact":false,"message":"String must contain at most 255 character(s)","path":["title"]}]}`. The autosave PATCH on the title textarea fires identical 400s (5 in the network log) while the user types; the editor displays the long title locally but the persisted title stays at the original 15-char `long-title-test`. **Finding: title is silently capped at 255 chars server-side, the user gets no client-side validation feedback, and the displayed-vs-persisted-state divergence is invisible until reload.** | `long-title.md` + `screenshots/long-title.png` + `screenshots/long-title-list.png` |
| 7 | HTML / script injection in title + body | ✅ **No XSS.** Title rendered as React text inside a `<textarea>`, no script execution. Body content goes through the TipTap parser: pasted `<script>alert(3)</script>` ends up rendered as the literal escaped string `&lt;script&gt;alert(3)&lt;/script&gt;` inside a paragraph. No `dialog` event fired. CSP `script-src 'self' 'unsafe-inline'` still blocks event-handler attributes. **Finding stands**: defense-in-depth is layered correctly. | `html-injection.md` + `screenshots/html-injection-after-reload.png` |
| 9 | Yjs persist with malformed fragment | ✅ **Graceful fallback to empty editor.** Approach that worked: create doc via POST, then immediately corrupt `yjs_state` (set to garbage bytes) and `content` (set to JSON string `"<broken>"`) via psql, then open the editor for the *first time* (so the server-side Y.Doc cache is bypassed). Editor mounts, shows "Start writing…" placeholder, body length = 1 char. No console errors visible from the client. Live confirmation of `getOrCreateDoc()`'s graceful-fallback path (`api/src/collaboration/index.ts:195–259`). **Sub-finding (worth filing):** the obvious test order (open → type → close → wait > 30 s → reopen) does **not** trigger the fallback — the server-side in-memory Y.Doc cache (`collaboration/index.ts:774`) outlasts the 30 s GC wait in practice. This is a *hidden* safety net that also makes the fallback path hard to test without an API restart. | `malformed-yjs.md` + `screenshots/malformed-yjs-corrupted.png` |
| 10 | Concurrent visibility-change race | ✅ **WS close fires; post-flip keystrokes are dropped.** pageA (`dev@ship.local`, super-admin) creates a workspace-visibility doc; pageB (`alice.chen@ship.local`, regular member — all seed users share password `admin123`) joins and starts typing. pageA `PATCH /api/documents/<id>` with `{"visibility":"private"}` → 200. Within the 4-second observation window, pageB's WebSocket gets 1 `ws-close` event after the PATCH timestamp. The persisted body via `/api/documents/<id>/content` contains only B's pre-flip text (`Typing as user B before visibility change.`) — the post-flip keystrokes (`Typing as user B AFTER visibility change.`) are NOT persisted. Live confirmation that `handleVisibilityChange` (`api/src/collaboration/index.ts:530–575`) does close non-admin clients' WS on visibility flip, and that in-flight messages after close are dropped. | `visibility-race.md` + `screenshots/visibility-race-userB.png` |

## Scenarios captured via live curl (prior session)

| # | Scenario | Evidence |
|---|---|---|
| 4† | CSRF rejection content-type | `csrf-html-response.txt`: live curl POST without CSRF token → HTTP 403 `text/html` with stack-trace `<pre>` block. The "no global error handler" finding is also visible in the response shape. |
| 8† | Network 500 from API → HTML | `api-500-html-response.txt` (counter-example showing the proper JSON 500 path) + `csrf-html-response.txt` (the HTML 4xx case). Handler-grep confirms no global `(err, req, res, next)` middleware exists in `api/src/`. |

† these were labeled "Scenario 4" and "Scenario 8" loosely in the prior session's evidence headers; they correspond to repro-scripts.md scenarios that don't share numbering with this run.

## Not directly captured

- **5: Submit empty form** — `createDocumentSchema.safeParse` returns a 400 with `details` on empty input. Not separately demonstrated; closely adjacent to the 400 path exercised in scenario 6.
- **8: Network 500 from API choke** — covered by the prior `csrf-html-response.txt` (HTML 403/400) plus `api-500-html-response.txt`.

## Repro

```bash
cd /Users/sheep/Desktop/Gauntlet/ship
WEB=http://localhost:5173 node orientation/baselines/runtime-errors/scenarios.mjs              # all 9
WEB=http://localhost:5173 node orientation/baselines/runtime-errors/scenarios.mjs only=1,3,9   # subset
```

Scenario 2 (yjs-to-json-null) requires a temporary defect injection in `api/src/utils/yjsConverter.ts` per the reproduction protocol in `yjs-to-json-null.md` — apply, wait for tsx reload, run scenario, `git restore` immediately.

The script auto-uses the chromium-1200 binary from playwright's cache, logs in via the UI (no shared cookies), and writes evidence + screenshots in place. Safe to re-run — it creates a few new wiki docs (`malformed-yjs-test`, `long-title-test`, `xss-test`, `visibility-race-test`) per run; they're harmless and can be archived/deleted later via the UI.

## Notes on diagnosis

- The Playwright MCP plugin couldn't be used — it hard-codes `channel: 'chrome'` and refuses the chromium-1200 binary. The `.mcp.json` was edited to add `--browser=chromium` for next session.
- The dev box has no Chrome stable installed. `npx playwright install chrome` requires sudo, which the agent doesn't have.
- After each navigation to `/documents/<id>`, a Radix dialog overlay opens (likely the first-visit explainer). The script presses Escape until it clears (`dismissOverlays`).
- Console output is deduplicated per `(type, text)` pair — the Yjs cursor library emits the "unsupported color format" warning dozens of times per session.
