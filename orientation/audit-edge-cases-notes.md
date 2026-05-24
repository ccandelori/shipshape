# Audit Edge Cases — Discussion Notes

Captured 2026-05-21. Two answers preserved verbatim for follow-up.

---

## Q1: Biggest edge case in the context of performing the audit?

**The biggest audit edge case was C-1: the silent `yjsToJson()` NULL persist** (`api/src/utils/yjsConverter.ts:62-110` → `api/src/collaboration/index.ts:118,174`).

What makes it the standout from an *auditing* standpoint, not just a *bug* standpoint:

- **Invisible from every normal vantage.** Static review sees a try/catch wrapping the persist. WebSocket sync looks healthy — `yjs_state` (binary CRDT) is still being saved. REST clients just see an empty `content` field and might blame their own caching.
- **The catch caught nothing.** `JSON.stringify(undefined)` doesn't throw — it returns `undefined`, which `pg` happily writes as SQL `NULL`. The defect slips between the type system (return type is `any`) and the runtime guard.
- **Required defect injection to prove, not just suspect.** The audit had to (a) patch `yjsConverter.ts` to return `undefined` on a marker phrase, (b) type that phrase live through the editor, (c) query `content IS NULL` and `octet_length(yjs_state)` side-by-side, then (d) `git restore` the file. See `orientation/baselines/runtime-errors/evidence/yjs-to-json-null.md` — the receipts: `content_is_null = t` with `yjs_state = 96 bytes`.

That's the methodology edge: a static-analysis pass would have shrugged at this code. The audit only caught it by treating "what would silent failure here look like in the database?" as a probe rather than a conclusion.

Honorable mention: **H-8** (Tailwind opacity modifiers destroying token contrast — `text-muted/50` measures 2.26:1) is the same shape — a finding that requires computing through the abstraction rather than trusting it. The design tokens are correct; the modifier math silently breaks them.

---

## Q2: What's the methodology for H-8?

Traced through the evidence files:

**1. Establish the design-system claim.** Read `tailwind.config.js:11` — the comment explicitly documents that `--muted` was *bumped* from `#737373` (4.09:1) to `#8a8a8a` (5.1:1) to clear WCAG AA. That's the contract the codebase claims to honor.

**2. Run live tools that report effective rendered color, not source color.** Two layers:
   - **Lighthouse 13.3.0** across 10 routes → `orientation/baselines/accessibility/lighthouse-*.json`. Surfaces `color-contrast` failures with the *as-rendered* foreground/background hex pairs and the computed ratio.
   - **@axe-core/playwright** across 8 authenticated routes (`axe-scan.mjs`) → `axe-*.json`. Same data, deeper rule coverage, runs against a logged-in session so cards/badges/toolbars actually render.

**3. Notice the failures cluster on opacity-modified utilities, not on the base tokens.** Failing pairs all involve `text-muted/50` or `bg-accent/20`, never `text-muted` or `bg-accent` alone. That's the smoking gun — the *source* token is fine; the *modifier* breaks the contract.

**4. Do the blending arithmetic by hand to confirm.** Tailwind's opacity modifier doesn't dim the foreground — it composites foreground at 50% alpha against the *underlying background*. So `text-muted/50` (`#8a8a8a` at 50%) over `#0d0d0d` is not `#8a8a8a` darkened; it's `(0x8a + 0x0d) / 2 = 0x4c` → effective `#4c4c4c` on `#0d0d0d` = **2.26:1** (Lighthouse confirms). Same math for `bg-accent/20` (`#005ea2` 20% over `#0d0d0d` → `#0a1d2b`), making accent-on-`#0a1d2b` labels **2.55:1**.

**5. Grep for blast radius, not just instances.** Once the *pattern* is the bug, you stop counting failing nodes and start counting *callsites*: every place using `bg-accent/20` for "current" / "selected" / hover states is implicated, including ones Lighthouse never opened (modals, dialogs, hover-only states). That's why H-8 is severity High despite only 9 + 3 nodes surfacing in live scans.

**6. Phrase the fix at the token layer.** A pre-blended `text-muted-soft` (`#6b6b6b`) and `bg-accent-soft` token maintains 4.5:1 by construction. One swap; every callsite benefits. The fix proves the diagnosis: if the issue were "9 elements with bad contrast," you'd fix 9 components. Since the issue is "the modifier silently violates the token contract," you fix the design system.

The methodological move that matters: **distrust automation-as-rendered-pixels alone**. Lighthouse told us *that* 9 things failed; doing the arithmetic over the source utilities told us *why* — and once you know why, the audit changes shape from a finding list to a single-line design-system bug.
