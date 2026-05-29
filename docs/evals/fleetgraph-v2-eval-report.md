# FleetGraph V2 deterministic evals

Generated at: 2026-05-29T19:31:26.680Z

## Summary

| Metric | Value |
|---|---:|
| Status | pass |
| Total cases | 8 |
| Passed cases | 8 |
| Failed cases | 0 |
| Total assertions | 26 |
| Passed assertions | 26 |
| Failed assertions | 0 |
| Pass rate | 100.00% |

## Cases

| ID | Name | Category | Status | Assertions |
|---|---|---|---|---:|
| FG-EVAL-009 | Material-change guard ignores cosmetic churn and catches blocker changes | proactive | pass | 2/2 |
| FG-EVAL-010 | Open finding suppresses duplicate proactive detector work | proactive | pass | 4/4 |
| FG-EVAL-011 | Advisory locks serialize concurrent proactive runs for one scope | proactive | pass | 3/3 |
| FG-EVAL-012 | Public trace export is opt-in and FleetGraph-tag gated | observability | pass | 5/5 |
| FG-EVAL-013 | Langfuse metadata redacts secrets and normalizes exported fields | observability | pass | 4/4 |
| FG-EVAL-014 | On-demand chat sends only the bounded recent history window | chat | pass | 3/3 |
| FG-EVAL-015 | Chat rate limit blocks requests after the configured hourly budget | chat | pass | 3/3 |
| FG-EVAL-016 | Trace URL construction produces safe share targets only with complete IDs | observability | pass | 2/2 |

## Assertions

### FG-EVAL-009: Material-change guard ignores cosmetic churn and catches blocker changes

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| material_change | Cosmetic text churn | pass | same | same |
| material_change | Blocker content change | pass | changed | changed |

### FG-EVAL-010: Open finding suppresses duplicate proactive detector work

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| material_change | Material key match | pass | same | same |
| finding_presence | Existing finding | pass | present | present |
| action_candidate | Detector decision | pass | skip | skip |
| scope_guard | Suppression reason | pass | suppressed_open_finding | suppressed_open_finding |

### FG-EVAL-011: Advisory locks serialize concurrent proactive runs for one scope

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| concurrency_guard | Acquire sequence | pass | true,false,true | true,false,true |
| concurrency_guard | Release sequence | pass | true,true | true,true |
| concurrency_guard | Shared lock key | pass | -5152227387797086476 | -5152227387797086476 |

### FG-EVAL-012: Public trace export is opt-in and FleetGraph-tag gated

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| trace_export | Disabled export | pass | not_published | not_published |
| trace_export | Non-FleetGraph tag | pass | not_published | not_published |
| trace_export | FleetGraph tag | pass | published | published |
| trace_export | Set public call count | pass | 1 | 1 |
| trace_export | Publisher call count | pass | 1 | 1 |

### FG-EVAL-013: Langfuse metadata redacts secrets and normalizes exported fields

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| redaction | Email redaction | pass | redacted | redacted |
| redaction | Secret redaction | pass | redacted | redacted |
| redaction | Metadata key normalization | pass | bad_key_ | bad_key_ |
| redaction | Metadata value truncation | pass | 200 | 200 |

### FG-EVAL-014: On-demand chat sends only the bounded recent history window

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| history_window | Selected history count | pass | 10 | 10 |
| history_window | Oldest selected message | pass | message-3 | message-3 |
| history_window | Newest selected message | pass | message-12 | message-12 |

### FG-EVAL-015: Chat rate limit blocks requests after the configured hourly budget

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| rate_limit | Allowed request count | pass | 10 | 10 |
| rate_limit | Blocked request count | pass | 1 | 1 |
| rate_limit | Retry-after seconds | pass | 3600 | 3600 |

### FG-EVAL-016: Trace URL construction produces safe share targets only with complete IDs

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| trace_metadata | Encoded trace URL | pass | https://us.cloud.langfuse.com/project/project%20123/traces/trace%2Fabc | https://us.cloud.langfuse.com/project/project%20123/traces/trace%2Fabc |
| trace_metadata | Missing project id | pass | null | null |

