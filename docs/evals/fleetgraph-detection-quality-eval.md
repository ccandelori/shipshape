# FleetGraph Detection Quality Eval (v1)

Generated at: 2026-05-29T20:00:22.204Z

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
| DQ-Q01 | Completely clean week | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/395191121a1a47b757c1e4e9f3b3917c) | pass |
| DQ-Q02 | Active work with no blockers | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/48ac10eb11261f4a8342c9b5fe2bfcd8) | pass |
| DQ-Q03 | Low-priority blocked item with recent positive update | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/0fb30befcc3a0c29aa67e6d3e7827f03) | pass |
| DQ-Q04 | "Block" language but context is resolved | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/ff8a06791454ec137635c93b52844061) | pass |
| DQ-Q05 | High volume but all moving with recent standups | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/92847024ef62d15c2dc714a0ce759a19) | pass |
| DQ-R01 | Classic high-priority blocker with standup signal | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/eedcf0102dddb9def28bb663ea1d066a) | pass |
| DQ-R02 | Multiple stalled issues with no recent updates | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/3912dc4e3ecf5a17aa88af5afc5e40d0) | pass |
| DQ-R03 | Owner overloaded with no visible progress | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/efad6941fb67264083fb252ee89af120) | pass |
| DQ-R04 | Aging technical blocker near week end | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/9e459de6a80456442218e628441d4b9c) | pass |
| DQ-R05 | Missing weekly plan + visible stalling | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/c9ef7e6b82d2ec366c45b04e42c92758) | pass |
| DQ-R06 | Subtle risk: volume + silence on critical path | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/afe6fce1844efe9340e4c6d6e8b06058) | pass |
| DQ-R07 | Iteration blocker with no standup coverage | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/de9cab014f1d332186c0b62e06448d9f) | pass |
| DQ-Q06 | Old blocker explicitly marked resolved in latest standup | live_model | no | no | no | no_blockers_or_blocked_high_priority_issues | pass | no | prefilter-exit | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/f18a74a9a5befc21b2d97bcd30c1c64f) | pass |
| DQ-R08 | Critical path items silent for multiple standups | live_model | yes | yes | yes | candidate_risk | pass | yes | output | pass | [trace](https://us.cloud.langfuse.com/project/cmpmytg8s012vad0g8q19n2xv/traces/40a2a18b8cfdc3ffcad3d80dc5414306) | pass |

---

**Note:** Default mode runs pre-filter only (cheap + deterministic).
Use `--live` for full graph execution with real model calls (opt-in only).
See `FLEETGRAPH.md` for the canonical submission scope and trace matrix.
