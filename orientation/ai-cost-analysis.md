# AI Cost Analysis — ShipShape Phase 2

Required by the GFA Week 4 brief's submission deliverables:
> Dev spend + reflection on AI tool effectiveness for codebase comprehension.

## Spend

> ⚠️ Cameron to fill in actual figures from billing dashboards before submission.

| Source | Plan / model | Period | $ (approx.) | Notes |
|---|---|---|---|---|
| Claude Code (Anthropic) | Opus 4.7 + Sonnet 4.6 | 2026-05-19 → 2026-05-22 | $___ | Primary driver. Orientation, audit, Phase 2 implementation, blocker followup. |
| (any other tools) | — | — | $___ | Add rows if used (Cursor, ChatGPT, Copilot, etc.) |
| **Total** | | | **$___** | |

## Where the spend went (qualitative)

Three broad buckets, roughly proportional to time:

### 1. Codebase comprehension (Phase 1 orientation + audit) — ~30%

The audit phase had Claude Code read every file under `docs/`, `shared/`, every route in `api/src/routes/`, and trace request flows from React component through the API to the database. Two specific moves had outsized return:

- **The Yjs dual-persistence pattern would have taken 4+ hours to discover manually.** Claude found it by chaining the schema (`schema.sql` mentions `yjs_state` + `content`), the persist path (`api/src/collaboration/index.ts:111-178`), and the converter (`api/src/utils/yjsConverter.ts`). The "two columns persisted in one UPDATE" insight surfaced after reading ~40 files; doing the same by hand would have meant a much narrower investigation.
- **The defect-injection protocol for proving silent NULL persist was Claude's idea.** Inject a marker phrase into `yjsToJson`, type the marker, query `content IS NULL` and `octet_length(yjs_state)`, then `git restore`. That style of evidence wasn't in my repertoire; it now is.

### 2. Phase 2 mechanical refactors — ~50%

The mechanical-but-broad work was the bulk:

- Replacing 73 `mockResolvedValue({rows: [...]} as any)` casts with `pgResult([...])` across 4 test files.
- The `mockedPool()` typed alias collapsing the vitest chain-typing problem across 7 test files.
- The `requireParam` sweep across 5 route files (~94 `getVisibilityContext(userId, workspaceId)` call sites updated to pass `req`).
- The `HttpError` class replacing 30 `new Error(…) as Error & { status }; error.status = N; throw error` patterns across 14 hooks.
- Fixing all 82 `noUncheckedIndexedAccess` errors after restoring the strict flag.

This bucket is where the agent-vs-human cost equation tilted most clearly toward AI. None of it required novel thinking; all of it required deep file-tree awareness and ruthless consistency.

### 3. Diagnosis + recovery — ~20%

The HttpError import regression. The vitest chain-typing forcing function. The transient test pollution. Each one took a series of "try, fail, learn, try again" cycles. Claude's diagnosis loop here (read error → form hypothesis → write probe → check) is faster than mine for problems with clear failure signals, slower for ambiguous flaky ones.

## What worked

- **Codebase reading at scale.** Claude opened ~200 files during the audit phase. I would have opened ~30 by hand and missed half the patterns.
- **Mechanical refactors that span many files.** The pg-mock + requireParam + HttpError sweeps would have been multi-PR efforts manually; Claude did them as single-commit batches with full test coverage.
- **Type-system pattern recognition.** The vitest `Promise<void>` chain-typing problem is obscure; Claude diagnosed it in two attempts.
- **Documentation matching the work.** Each `orientation/improvements/<cat>.md` was written alongside the code change rather than as a separate pass.

## What didn't

- **Repeated `pnpm install` overhead.** Each fresh shell, Claude tended to re-run a check that triggered network fetches. With the prompt cache TTL of 5 minutes, this compounded.
- **Test pollution diagnosis.** When `weeks.test.ts` flaked due to vitest shared-process state pollution, Claude over-indexed on "what changed" instead of "vitest config." Probably a human would have spotted the `fileParallelism: false` faster.
- **The `as any` chain-typing whack-a-mole.** Forty-five minutes spent fighting vitest mock chain inference. Should have refactored the helper signature in attempt 1 instead of attempt 4.

## Effectiveness for codebase comprehension specifically

The brief asks specifically about "AI tool effectiveness for codebase comprehension." Concrete observations:

- **For unfamiliar terrain, AI is a >2× multiplier.** The Phase 1 audit went 36 hours brief-to-shipped because Claude could read the whole `docs/`, every route, and connect them into a coherent mental model. Solo, that's the kind of work that takes a week.
- **For familiar terrain, the multiplier flattens.** Once I knew where the silent-NULL bug was, the actual fix took ~10 minutes of typing — the audit-and-prove phase was 90% of the value.
- **The biggest savings were in writing _and_ reading at the same time.** Most of the Phase 2 work was patches that crossed multiple files (auth middleware + visibility middleware + 11 route files). Holding all of that in head at once is exactly the kind of context AI handles well.

## Reflection (to be filled in)

> Cameron: drop in 2-3 paragraphs of personal reflection on how this changed the way you'll approach unfamiliar codebases going forward. The brief asks for this. Mine to write, not Claude's.
