# FleetGraph V1 deterministic evals

Generated at: 2026-05-29T19:31:26.680Z

## Summary

| Metric | Value |
|---|---:|
| Status | pass |
| Total cases | 8 |
| Passed cases | 8 |
| Failed cases | 0 |
| Total assertions | 24 |
| Passed assertions | 24 |
| Failed assertions | 0 |
| Pass rate | 100.00% |

## Cases

| ID | Name | Category | Status | Assertions |
|---|---|---|---|---:|
| FG-EVAL-001 | Healthy Week exits quietly before model reasoning | proactive | pass | 4/4 |
| FG-EVAL-002 | Blocked Week produces finding and pending action | proactive | pass | 4/4 |
| FG-EVAL-003 | On-demand chat uses the compiled FleetGraph graph branch | chat | pass | 3/3 |
| FG-EVAL-004 | Week chat prompt stays grounded in scoped Ship sources | chat | pass | 3/3 |
| FG-EVAL-005 | Notify-only recommendations do not create pending actions | policy | pass | 3/3 |
| FG-EVAL-006 | Visible writes require explicit HITL approval | policy | pass | 3/3 |
| FG-EVAL-007 | Proactive detector enters the compiled FleetGraph graph branch | proactive | pass | 3/3 |
| FG-EVAL-008 | Unsupported chat scopes fail closed before model execution | scope | pass | 1/1 |

## Assertions

### FG-EVAL-001: Healthy Week exits quietly before model reasoning

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| branch_path | Branch path | pass | prefilter-exit | prefilter-exit |
| finding_presence | Finding presence | pass | none | none |
| action_candidate | Action candidate | pass | none | none |
| trace_metadata | Token spend | pass | 0/0/$0.000000 | 0/0/$0.000000 |

### FG-EVAL-002: Blocked Week produces finding and pending action

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| branch_path | Branch path | pass | output | output |
| finding_presence | Finding presence | pass | present | present |
| action_candidate | Action candidate | pass | present | present |
| trace_metadata | Token spend | pass | 850/172/$0.000231 | 850/172/$0.000231 |

### FG-EVAL-003: On-demand chat uses the compiled FleetGraph graph branch

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| branch_path | Graph branch | pass | ondemand_chat | ondemand_chat |
| chat_response | Streamed response | pass | Procurement blocker is still blocked. | Procurement blocker is still blocked. |
| trace_metadata | Usage metadata | pass | 12/5/17 | 12/5/17 |

### FG-EVAL-004: Week chat prompt stays grounded in scoped Ship sources

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| chat_sources | Source labels | pass | FleetGraph Eval Week\|Procurement blocker\|Tuesday standup | FleetGraph Eval Week\|Procurement blocker\|Tuesday standup |
| chat_sources | Source kinds | pass | scope\|related\|related | scope\|related\|related |
| scope_guard | Untrusted context boundary | pass | present | present |

### FG-EVAL-005: Notify-only recommendations do not create pending actions

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| approval_policy | Lifecycle state | pass | open | open |
| approval_policy | Approval level | pass | notify_only | notify_only |
| action_candidate | Action candidate | pass | none | none |

### FG-EVAL-006: Visible writes require explicit HITL approval

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| approval_policy | Lifecycle state | pass | pending_review | pending_review |
| approval_policy | Approval level | pass | approval_required | approval_required |
| action_candidate | Action candidate | pass | present | present |

### FG-EVAL-007: Proactive detector enters the compiled FleetGraph graph branch

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| branch_path | Graph branch | pass | proactive_at_risk_week | proactive_at_risk_week |
| trace_metadata | Completed nodes | pass | branch\|proactive_at_risk_week | branch\|proactive_at_risk_week |
| finding_presence | Nested detector state | pass | completed | completed |

### FG-EVAL-008: Unsupported chat scopes fail closed before model execution

| Metric | Assertion | Status | Expected | Observed |
|---|---|---|---|---|
| scope_guard | Unsupported document type | pass | rejected | rejected |

