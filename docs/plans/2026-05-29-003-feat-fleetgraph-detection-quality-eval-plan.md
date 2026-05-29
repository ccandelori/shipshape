# Plan: First-class FleetGraph Detection Quality Eval Harness

**Created:** 2026-05-29
**Status:** active
**Type:** feat
**Owner:** sheep + Codex (Compound Engineering mode)
**Target Window:** Hard stop Saturday 2026-05-30 00:00 (≈ 36 hours from plan start)
**Origin Context:** Week 5 GFA PRD + post-submission desire to go meaningfully above and beyond on agent evaluation quality.

---

## Problem Frame

The original Week 5 FleetGraph PRD only required the implementer to *define* their own test cases and supply Langfuse traces showing different execution paths. The current codebase has excellent deterministic regression coverage for the *control plane* (V1 + V2 suites, 16 cases / 50 assertions, `pnpm fleetgraph:eval`, advisory locks, material-change guards, rate limits, redaction, etc.).

What is missing is any automated or repeatable signal on **model output quality / detection quality**:

- Does the `at_risk_week` detector correctly stay quiet on healthy weeks?
- Does it surface the right blockers with reasonable severity, evidence, owner, and recommended action on risky weeks?
- Can we detect quality regressions (or improvements) when we change prompts, context builders, or the reasoning model?

Without this layer, every prompt or detector tweak is a manual, non-repeatable experiment. This is the gap we want to close as the "above and beyond" artifact.

**Goal for this slice:** Ship the *foundation* of a first-class, check-in-able detection quality eval that lives alongside the existing deterministic evals and can be run as `pnpm fleetgraph:quality-eval` (or equivalent).

---

## Success Criteria (this 2-day window)

- A new runnable command exists that produces human-readable + machine-readable reports in `docs/evals/`.
- 8–12 high-signal golden cases are defined and executable (balanced quiet vs. risky).
- Judgment leverages the already strongly-typed `AtRiskWeekReasoningOutput` + downstream policy/finding artifacts.
- Hybrid execution model: mostly deterministic (repeatable, cheap, hermetic) + a small number of live OpenAI runs captured as evidence.
- The artifact is designed to be evolved (not a throwaway script).
- Clear documentation of what the eval measures today and what it deliberately does *not* measure yet.
- At least one `ce-compound` learning captured before the deadline.

**Explicit non-goals for this slice:**
- Full chat quality eval (deferred).
- Large dataset (20+ cases).
- Sophisticated LLM-as-judge with calibration.
- CI enforcement or blocking gates.
- Production-grade human review UI.

---

## Key Technical Decisions & Trade-offs

| Decision | Chosen Approach | Why | Trade-off / Risk |
|----------|------------------|-----|------------------|
| **Command integration** | First-class script under `api/src/fleetgraph/scripts/` + new pnpm script (modeled on `fleetgraph:eval`) | Consistency with existing `fleetgraph:*` commands and report shape | Slightly more wiring than a standalone script |
| **Dataset size** | Start with 8–12 cases | Achievable + high signal in the timebox | May feel small; we will explicitly document this as v1 foundation |
| **Judgment strategy** | Heavy use of typed `AtRiskWeekReasoningOutput` + preFilter / policy / finding outcomes. Light structural assertions + selective live runs | We already have excellent typed outputs; avoids building a full judge now | Some "good answer" nuance will be lost until we add richer judgment later |
| **Execution model** | Mostly deterministic (using existing proof reasoner + fixtures) + 2–4 captured live runs | Repeatability + cost control while still having real-model evidence | Live runs must be explicitly marked and not required for the default command |
| **Report shape** | Same style as V1/V2 reports (markdown + JSON) in `docs/evals/` | Familiar to anyone who has looked at the existing eval artifacts | Report will be more narrative/quality-oriented than pure pass/fail |
| **Data sourcing** | Extend patterns from `evals.ts` + `demo-scenarios.ts` (WeekContext fixtures) | Reuse existing hermetic workspace/user/doc creation + cleanup | Some duplication until we extract a shared fixture library |

---

## Scope Boundaries

### In Scope (this plan)
- New quality eval runner + report generator
- 8–12 curated WeekContext golden cases (mix of quiet and risky)
- Command wiring + pnpm script
- Basic documentation (README section or inline in the report)
- One `ce-compound` capture of the approach

### Deferred / Explicitly Out of Scope
- Chat quality evaluation
- Large-scale historical replay or production trace import
- Sophisticated LLM judge
- CI gate or blocking behavior
- Human review workflow / UI
- Full precision/recall measurement over many weeks

---

## Implementation Units

### U1. Create Quality Eval Runner Skeleton + Report Format
**Goal:** Establish the command shape and report output contract.

**Files:**
- `api/src/fleetgraph/scripts/run-detection-quality-eval.ts` (new)
- `api/package.json` (add script)
- `package.json` (root, add `fleetgraph:quality-eval`)

**Approach:**
- Mirror structure of `run-evals.ts` and `evals.ts`.
- Produce both `.md` and `.json` reports in `docs/evals/`.
- Support flags for `--live`, `--case`, `--limit` (for iteration speed).
- Default mode must be fully deterministic (no OpenAI keys required).

**Test scenarios:**
- Command runs cleanly with no live calls and produces both report formats.
- Report contains summary table + per-case detail.
- `--case` flag runs a single case.

**Verification:** Running the new command locally produces a report that can be read and understood without looking at source.

### U2. Design & Implement Golden Case Fixture System
**Goal:** Reusable, typed way to define high-signal Week states for quality evaluation.

**Files:**
- `api/src/fleetgraph/evals/detection-quality-cases.ts` (new, or inside existing evals dir)
- Possibly light extensions to existing context builders

**Approach:**
- Define a small number of curated `WeekContext` variants (4–5 quiet, 5–7 risky with different blocker patterns: procurement, people, technical, scope creep, etc.).
- Each case should have explicit "expected high-level outcome" metadata (should fire finding? severity? primary blocker source?).
- Keep fixtures hermetic and fast to construct.

**Test scenarios:**
- All fixtures can be constructed without a database.
- Cases cover both early-exit quiet paths and full reasoning paths.

**Verification:** A reviewer can look at the fixture file and understand what "risky situation" each case represents.

### U3. Implement Judgment Layer + Case Runner
**Goal:** Execute a case against the real detector graph and produce structured observations that can be judged.

**Files:**
- `api/src/fleetgraph/evals/detection-quality-cases.ts` (judgment logic)
- Extensions in `api/src/fleetgraph/detectors/at-risk-week.ts` if needed for observability hooks (prefer not to touch core if possible)

**Approach:**
- For deterministic runs: use the existing `createProofReasoner` / passthrough patterns.
- For live runs: allow opt-in real model execution with explicit tagging in the report.
- Extract key signals: pre-filter decision, reasoning `isAtRisk`, severity, evidence sources, recommended action kind, policy level.
- Compare against per-case expected outcome.

**Test scenarios:**
- Quiet case produces `prefilter-exit` or `not_at_risk` with no finding.
- Clear blocker case produces finding with appropriate severity and owner.
- Judgment fails loudly (with clear diff) when outcome does not match expectation.

### U4. Wire Command + Reporting + Documentation
**Goal:** Make the whole thing feel first-class and documented.

**Files:**
- Update `api/src/fleetgraph/scripts/run-detection-quality-eval.ts`
- `docs/evals/fleetgraph-detection-quality-eval.md` (initial hand-written guidance)
- Update `FLEETGRAPH.md` and/or `docs/fleetgraph-agent-exercise-guide.md` with a short reference

**Approach:**
- Report should feel like an evolution of the V1/V2 reports (familiar columns + new quality-oriented columns).
- Include a "Limitations of this version" section.
- Add usage instructions and cost notes for live mode.

**Test scenarios:**
- Full end-to-end run of the command produces a report that tells a coherent story about the current detector quality.
- Documentation is sufficient for a future contributor to add a new case in < 15 minutes.

---

## Risks & Mitigations

- **Time pressure** — We may only complete 6–8 really strong cases instead of 12. Mitigation: prioritize signal over quantity; explicitly call the set "v1 foundation."
- **Judgment quality** — Early version will be coarse. Mitigation: document limitations clearly and design for easy future enrichment.
- **Live model cost / non-determinism** — Mitigation: live runs are opt-in and clearly marked; default path is deterministic.
- **Fixture maintenance** — Risk that golden cases drift from real usage. Mitigation: start small and tie cases to real patterns we have already seen in production traces.

---

## Sequencing & Dependencies

1. U1 (skeleton + command) — can start immediately
2. U2 (fixtures) — largely parallel with U1
3. U3 (judgment + runner) — depends on U1 + U2 having basic shape
4. U4 (polish + docs) — last

We will use `ce-compound` at least once (likely after U3 is working) to capture the approach while context is fresh.

---

## Open Questions (to resolve during execution)

- Exact command name (`fleetgraph:quality-eval` vs `fleetgraph:detection-quality` vs something shorter)?
- Should the quality eval share code with the existing `evals.ts` more aggressively, or live in its own module for clarity?
- How do we want live runs to be recorded (separate "live evidence" section in the report)?

These will be decided in the first day of execution.

---

**Plan ready for execution.** Once you confirm, we can begin U1 or adjust any section. We will run `ce-compound` on the key learnings as they emerge.
