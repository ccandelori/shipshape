# AI Cost Analysis — ShipShape Phase 2

Required by the GFA Week 4 brief's submission deliverables:
> Dev spend + reflection on AI tool effectiveness for codebase comprehension.

## Spend

Period: 2026-05-18 18:22 UTC → 2026-05-24 20:17 UTC (6 days, 2 hours). Scope: every session under `~/.claude/projects/-Users-sheep-Desktop-Gauntlet-ship` and `-shipshapesec` (the audit target + the security probe tool), including spawned subagent transcripts. Aggregated from 209 session JSONLs covering 13,575 assistant turns.

| Source | Plan / model | Period | $ | Notes |
|---|---|---|---|---|
| Claude Code (Anthropic) | Max 20× subscription, Opus 4.7 + Sonnet 4.6 + Haiku 4.5 | 2026-05-18 → 2026-05-24 | **$40.00** | Pro-rated from $200/mo. Primary driver: orientation, audit, Phase 2 implementation, blocker followup, dashboard build, security probe tool. |
| **Actual spend** | | | **$40.00** | |

### Equivalent direct-API cost

If the same work had been billed at Anthropic's published per-token API rates instead of the flat subscription, it would have cost approximately **$9,014.12** — a ~225× multiplier over the subscription. The breakdown by model:

| Model | Turns | Input | Output | Cache read | Cache write 5m | Cache write 1h | $ |
|---|---:|---:|---:|---:|---:|---:|---:|
| Opus 4.x | 13,036 | 28,868 | 14,021,228 | 3,874,442,947 | 9,131,582 | 65,628,013 | $9,003.75 |
| Sonnet 4.x | 168 | 58,359 | 50,671 | 6,014,059 | 1,344,317 | 0 | $7.78 |
| Haiku 4.x | 364 | 4,273 | 54,480 | 12,622,911 | 1,361,355 | 0 | $2.59 |
| **Total** | **13,575** | **91,500** | **14,126,379** | **3,893,079,917** | **11,837,254** | **65,628,013** | **$9,014.12** |

Where the equivalent-API dollars would have gone:

- Cache reads — $5,811 (64%). 3.87B tokens read at the 90%-off cached rate.
- 1-hour cache writes — $1,968 (22%). 65.6M tokens at 2× input price.
- Output tokens — $1,051 (12%). 14M tokens at $75/MTok (Opus).
- 5-minute cache writes — $171 (1.9%).
- Uncached input — $0.43. Effectively zero: 98% of input was served from cache.

Pricing constants used (per million tokens): Opus $15 in / $75 out / $1.50 cache-read / $18.75 5m-write / $30 1h-write; Sonnet $3 / $15 / $0.30 / $3.75 / $6; Haiku $0.80 / $4 / $0.08 / $1.00 / $1.60. Sourced from Anthropic's public pricing as of Jan 2026; the multiplier scales linearly if rates have shifted since.

### Why the gap is this wide

The cache-read line is the punchline. Claude Code keeps the system prompt, tool definitions, prior conversation, and recently-read files in Anthropic's prompt cache, paying the 5m or 1h cache-write rate once and then reading them back at 10% of input cost on every subsequent turn. Across 13K Opus turns over a single project, the same context gets re-read thousands of times. A naive per-token API user pays for every read; the subscription absorbs them.

Without prompt caching, the same workload would have cost roughly **$60K** (recomputed at uncached input rates — every cached read instead billed at $15/MTok for Opus, $3 for Sonnet, $0.80 for Haiku). The cache cuts that by ~85% to $9K, and the Max subscription cuts what remains by another ~99.5% to $40.

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
