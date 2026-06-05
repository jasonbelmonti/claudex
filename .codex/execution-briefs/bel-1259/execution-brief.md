---
title: "BEL-1259 Execution Brief"
brief_id: "bel-1259"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-06-05T01:21:49Z"
updated_at: "2026-06-05T01:40:58Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1259"
target_branch: "codex/bel-1259-copilot-normalization"
review_boundary_id: "RB-bel-1259"
---

# Objective

Complete the skipped `BEL-1259` delta for Copilot event/result normalization. Current `main` already contains partial `CLX-COP-6` behavior under `BEL-1258`; this work must close the remaining file-change, approval-event, usage metadata, and sensitive-event containment gaps without reopening `BEL-1260` docs or smoke scope.

# Context / Constraints

- Confirmed constraints:
  - Latest user instruction on 2026-06-05 requests: execution brief, execution plan, execute, SOLID analysis, code simplification, boundary review, test-value review, consensus review until clean, then open PR.
  - Repository instructions require Node/npm workflows, Vitest, small focused modules, `npm run check` as baseline, and git worktrees under `.worktrees`.
  - Execution estimation ran before coding with `--decomposition-depth 1`: adjusted 8 points, high blast radius, heightened controls required, `plan-first`, no decomposition recommended.
  - Worktree is `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1259` on `codex/bel-1259-copilot-normalization` from `origin/main`.
- Dependencies:
  - `BEL-1258` runtime queue and Copilot session runtime are present on `main`.
  - Copilot SDK spike brief checksum verified as `36ffddb6de786eb4a51296d5fee2675a2050abd6491bbfe9d98f7ac04f27b872`.
- Non-goals:
  - Do not add passive ingest support.
  - Do not add authenticated live smoke tests or `BEL-1260` package/docs gates except where docs must not overclaim current capabilities.
  - Do not expose `assistant.reasoning` as `reasoning.summary`.
- Accepted tradeoffs:
  - Use focused fake Copilot events and contract tests; authenticated live behavior remains a later gate.
  - Map file-change and approval event shapes cautiously from proven SDK event families without claiming repository-level semantics beyond the event payload.
- Assumptions / Inferences:
  - `system.message`, `assistant.reasoning`, and reasoning deltas must remain omitted by default because the spike identified sensitive prompt/reasoning exposure risk.
  - `permission.completed` can normalize to approval resolution only from SDK completion payload facts; uncertain fields should be preserved in `extensions`, not forced into core semantics.

# Authoritative Sources

| Source | Retrieved at | Authority | Status | Controls |
| --- | --- | --- | --- | --- |
| Current user instruction | 2026-06-05T01:21:49Z | Latest operating route | loaded | Run requested skill sequence through PR creation. |
| `/Users/jasonbelmonti/Documents/Development/claudex/AGENTS.md` | 2026-06-05T01:21:49Z | Repo-local workflow rules | loaded | Node/npm, Vitest, worktrees, module boundaries, validation. |
| Linear `BEL-1259` | 2026-06-05T01:21:49Z | Task contract | loaded | Defines `CLX-COP-6` scope and success criteria. |
| Linear `BEL-1260` | 2026-06-05T01:21:49Z | Dependency conflict evidence | loaded | Confirms `BEL-1260` depends on `CLX-COP-6`; do not treat current `BEL-1260` work as completing this task. |
| Copilot SDK spike execution brief | 2026-06-05T01:21:49Z | Event-shape and sensitivity source | loaded and checksum verified | Controls SDK event families, sensitive event handling, and known live-smoke gaps. |
| Current implementation state | 2026-06-05T01:21:49Z | Observed code facts | loaded | Partial normalization exists in Copilot provider; missing families must be closed. |
| Execution estimation output | 2026-06-05T01:21:49Z | Execution gate | loaded | Plan-first required, high blast radius, heightened controls, no decomposition required. |

# Current State

- Planning / PM:
  - `BEL-1259` is still `Todo`, has no comments, no PR attachments, and no `bel-1259` branch in local or remote history before this worktree.
  - `BEL-1260` is already in progress and explicitly depends on `CLX-COP-1` through `CLX-COP-6`.
- Design:
  - Core normalized events already include `file.changed`, `approval.requested`, `approval.resolved`, `message.delta`, `message.completed`, `turn.completed`, and `turn.failed`.
  - Core results include `AgentUsage.providerUsage`, but Copilot result mapping currently stores provider usage only in `raw`.
- Implementation:
  - `src/providers/copilot/events.ts` already maps `session.start`, assistant message/delta, usage capture, tool start/update/complete, `session.error`, `model.call_failure`, and `session.idle`.
  - `src/providers/copilot/results.ts` already validates structured output and maps basic token usage.
  - This branch adds provider-owned mappers for `session.workspace_file_changed`, `permission.requested`, and `permission.completed`.
  - This branch explicitly omits `system.message`, `assistant.reasoning`, and `assistant.reasoning_delta` from normalized events by default.
  - This branch preserves Copilot usage payloads in normalized `AgentUsage.providerUsage`.
  - `src/providers/copilot/capabilities.ts` now marks `event:file-change` and `event:approval` available based on focused fake-session tests.
- Validation:
  - Proposal execution estimation completed before coding with high blast radius controls.
  - Spike checksum verification passed.
  - `npm test -- test/providers/copilot/session.test.ts test/providers/copilot/readiness.test.ts` passed with 34 tests on 2026-06-05.
  - `npm test -- test/contract` passed with 22 tests on 2026-06-05.
  - `npm run check` passed on 2026-06-05.
  - SOLID, code simplification, boundary, test-value, and three-reviewer consensus review gates completed with no validated blockers on 2026-06-05.
- Known gaps:
  - Authenticated live smoke remains a `BEL-1260` follow-up.
  - Rich reasoning summaries remain deferred until payload safety is proven.
  - Passive Copilot ingest remains out of scope.

# Execution Scope

| Scope item | Classification | Approval impact | Notes |
| --- | --- | --- | --- |
| Map Copilot file-change events | in-scope | blocking | Normalize `session.workspace_file_changed` to `file.changed` with cautious path/operation semantics and provider extensions where needed. |
| Map Copilot approval events | in-scope | blocking | Normalize `permission.requested` and `permission.completed` to `approval.requested` and `approval.resolved` without adding an interactive approval response API. |
| Preserve Copilot provider usage metadata | in-scope | blocking | Put provider usage details in `AgentUsage.providerUsage` while preserving existing raw usage. |
| Protect sensitive event omission | in-scope | blocking | Add tests proving `system.message`, `assistant.reasoning`, and reasoning deltas are not normalized or exposed by default. |
| Keep existing message/result/tool/error behavior | in-scope | blocking | Regressions in already-merged `BEL-1258` coverage block approval. |
| Authenticated live smoke and package docs | out-of-scope | non-blocking | Owned by `BEL-1260`; only update capability metadata if implementation changes it. |
| Rich reasoning summary support | out-of-scope | non-blocking | Deferred until Copilot reasoning payload safety is proven. |
| Passive Copilot ingest | out-of-scope | non-blocking | Explicit non-goal from `BEL-1259`. |

# Materially Verifiable Success Criteria

- [x] Existing assistant final message and streaming delta behavior remains covered and passing.
- [x] `assistant.usage` maps normalized token usage and preserves Copilot provider usage metadata in `providerUsage` or equivalent stable raw/extensions placement.
- [x] `session.workspace_file_changed` maps to normalized `file.changed` in focused fixture tests.
- [x] `permission.requested` and `permission.completed` map to normalized approval events in focused fixture tests.
- [x] Structured output validation still uses shared schema-validation behavior and fails with `structured_output_invalid` for invalid final text.
- [x] `system.message`, `assistant.reasoning`, and reasoning deltas are omitted from normalized events by default in focused tests.
- [x] Targeted provider and contract tests pass; broader `npm run check` passes before PR or any failure is documented as a stop condition.

# Review Boundary

| Boundary | Scope | Approval impact | Notes |
| --- | --- | --- | --- |
| Normalization correctness | in-scope | blocking | Event shapes, ordering, result usage metadata, structured output, and error identity must match core contracts. |
| Sensitive payload containment | in-scope | blocking | Reviewers should reject if internal prompts, full reasoning, or unproven reasoning payloads leak through normalized events or raw fields by default. |
| Existing Copilot runtime behavior | in-scope | blocking | No regression to terminal event behavior, session references, abort, timeout, or tool lifecycle coverage. |
| `BEL-1260` docs, smoke, and package verification expansion | out-of-scope | non-blocking | Missing final-integration docs/smoke work should not block this PR unless current metadata overclaims behavior. |
| Rich reasoning summaries and passive ingest | out-of-scope | non-blocking | Note as follow-up only unless this diff exposes sensitive data. |

# Planned Follow-up Work

- `BEL-1260` remains responsible for final docs, package checks, and opt-in authenticated Copilot smoke gates.
- Rich Copilot reasoning summaries remain deferred until payload semantics are proven safe.
- Passive Copilot ingest remains out of scope.

# Execution Plan

1. Write and validate a durable execution plan for this brief.
2. Inspect Copilot SDK event payload types and fake event helpers for file-change, approval, system, and reasoning event shapes.
3. Add focused tests for missing event families and sensitive-event omission.
4. Implement the smallest mapper/result changes needed to satisfy those tests.
5. Update capabilities only for behavior now implemented and validated.
6. Run targeted provider tests, contract tests, `npm run check`, skill review passes, consensus review, then PR.

# Validation Gates

- Brief validation:
  `npx -y @jasonbelmonti/markdown-engine@2.0.0 validate --file ./.codex/execution-briefs/bel-1259/execution-brief.md --profile /Users/jasonbelmonti/.codex/skills/execution-brief/profiles/execution-brief.yaml`
- Brief checksum:
  `shasum -a 256 ./.codex/execution-briefs/bel-1259/execution-brief.md > ./.codex/execution-briefs/bel-1259/execution-brief.sha256`
- Plan validation:
  `python3 /Users/jasonbelmonti/.codex/skills/execution-plan/scripts/validate_execution_plan.py --file ./.codex/execution-plans/bel-1259/execution-plan.md`
- Targeted provider tests:
  `npm test -- test/providers/copilot/session.test.ts`
- Contract tests:
  `npm test -- test/contract`
- Baseline:
  `npm run check`
- Review gates:
  SOLID analysis, code simplification pass, boundary review, test-value review, and three-reviewer consensus review with no validated blockers.

# Stop Conditions

- Stop if Copilot SDK type declarations do not expose enough stable payload shape to map file-change or approval events without unsafe guesses.
- Stop if event mapping requires a new public interactive approval response API.
- Stop if validation fails for reasons outside this task boundary.
- Stop if implementation expands beyond the proposed provider/event/result/test surface enough to require decomposition.
- Stop if consensus review validates a blocker that cannot be fixed without changing the task scope.

# Review Packet Inputs

| Field | Source section | Required mapping | Notes |
| --- | --- | --- | --- |
| `objective` | Objective | Complete skipped `BEL-1259` normalization delta. | Include that partial behavior already landed under `BEL-1258`. |
| `intended_behavior_change` | Execution Scope and Execution Plan | File-change, approval, usage metadata, and sensitive-event behavior should change. | Existing runtime behavior must be preserved. |
| `in_scope` | Execution Scope | Rows classified in-scope. | Blocking review items. |
| `out_of_scope` | Execution Scope and Planned Follow-up Work | Rows classified out-of-scope and deferred follow-up. | Non-blocking unless contradicted by the diff. |
| `constraints` | Context / Constraints | Node/npm, worktree, estimation, SDK sensitivity, no live smoke. | Preserve source authority. |
| `review_boundary` | Review Boundary | Copy approval-impact rules. | Primary anti-scope-creep control. |
| `planned_follow_up_work` | Planned Follow-up Work | Copy each deferred item. | Especially `BEL-1260`. |
| `test_or_risk_context` | Validation Gates and Current State | Include targeted tests, contract tests, `npm run check`, and high blast radius controls. | Include any skipped gate with reason. |

# Revision Log

| Timestamp | Actor | Change | Checksum |
| --- | --- | --- | --- |
| 2026-06-05T01:21:49Z | codex | Created initial `BEL-1259` Execution Brief. | pending |
| 2026-06-05T01:32:34Z | codex | Recorded implementation completion and passing validation gates before consensus review. | pending |
| 2026-06-05T01:40:58Z | codex | Recorded clean review gates and three-reviewer consensus APPROVE result. | pending |
