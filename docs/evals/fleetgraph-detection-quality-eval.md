# FleetGraph Detection Quality Eval (v1)

Generated at: 2026-05-29T19:24:45.769Z

Mode: live_model | live=true | trace=true | strict=true

## Summary

| Metric | Value |
|---|---:|
| Status | pass |
| Mode | live_model |
| Total cases | 14 |
| Executed cases | 14 |
| Passed cases | 14 |
| Failed cases | 0 |
| Error cases | 0 |

## Cases

| ID | Name | Tier | Exp Pre-Filter | Exp Final Finding | Pre-Filter Passed | Pre-Filter Reason | Pre Match | Final Finding | Branch Path | Final Match | Trace | Status |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| DQ-Q01 | Completely clean week | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/e8b1e0386b5c1daeb645666b875a68b4) | pass |
| DQ-Q02 | Active work with no blockers | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/d7e8d7810fff4aae25539dfa0da0904e) | pass |
| DQ-Q03 | Low-priority blocked item with recent positive update | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/6a6d99242308898f73be68750e12e6bd) | pass |
| DQ-Q04 | "Block" language but context is resolved | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/bcbec30ef1d7d336383f6eea792c6761) | pass |
| DQ-Q05 | High volume but all moving with recent standups | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/7e7e2c17d67025cda4004e18240bb8ac) | pass |
| DQ-R01 | Classic high-priority blocker with standup signal | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/51e85bc2707c1cb4abf21314ea1c1663) | pass |
| DQ-R02 | Multiple stalled issues with no recent updates | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/a4ee0e002b216f30aaea2a4a229e2f46) | pass |
| DQ-R03 | Owner overloaded with no visible progress | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/59cdb555274e91236166ee3f4a088e18) | pass |
| DQ-R04 | Aging technical blocker near week end | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/d38d76118abe5f42ff5dab4c572e1c45) | pass |
| DQ-R05 | Missing weekly plan + visible stalling | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/1ce1a9a8a37e4984e40c20b7c1b43b0d) | pass |
| DQ-R06 | Subtle risk: volume + silence on critical path | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/002e003a7e8504ecae0d3da12cb091f8) | pass |
| DQ-R07 | Iteration blocker with no standup coverage | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/819b5d77be5b6c7d43b1bcf86a31b52f) | pass |
| DQ-Q06 | Old blocker explicitly marked resolved in latest standup | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/2030219de9910949b74ecefd2d0792e7) | pass |
| DQ-R08 | Critical path items silent for multiple standups | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/ff45502dd1c1ede550c50cfc0336cb04) | pass |

---

**Note:** Default mode runs pre-filter only (cheap + deterministic).
Use `--live` for full graph execution with real model calls (opt-in only).
See `docs/plans/2026-05-29-003-feat-fleetgraph-detection-quality-eval-plan.md` for scope and roadmap.
