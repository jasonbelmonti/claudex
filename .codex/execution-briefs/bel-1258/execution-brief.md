---
title: "BEL-1258 Copilot Session Runtime Execution Brief"
brief_id: "bel-1258"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-06-01T15:54:01Z"
updated_at: "2026-06-01T21:41:54Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258"
target_branch: "codex/bel-1258-copilot-session-runtime"
review_boundary_id: "RB-BEL-1258"
---

# Objective

Implement BEL-1258 / CLX-COP-5: `CopilotSession.run()` and `runStreamed()` around `session.on()` plus `session.send()`, with deterministic terminal detection, abort behavior, session reference handling, and owned lifecycle cleanup assumptions. Implementation is complete in the BEL-1258 worktree and ready for review.

# Context / Constraints

- Confirmed constraints:
  - Current user instruction on 2026-06-01 requested `$execution-brief` for BEL-1258, then `$execution-plan`, then execution.
  - Repo instructions require Node and npm workflows, Vitest, focused modules, execution estimation before new work, and git worktrees under `.worktrees`.
  - BEL-1258 explicitly requires child execution estimation with `--decomposition-depth 1` before coding.
  - BEL-1258 depends on CLX-COP-4 session config and permission policy, now present in the refreshed worktree.
  - BEL-1258 should not complete all event normalization semantics; CLX-COP-6 owns detailed mapping beyond minimal runtime proof events.
- Dependencies:
  - CLX-COP-4 / BEL-1257 exists on `origin/main` through PR #69 and provides Copilot session config, MCP, permission, and validation helpers.
  - Copilot SDK spike findings checksum was verified as `36ffddb6de786eb4a51296d5fee2675a2050abd6491bbfe9d98f7ac04f27b872`.
- Non-goals:
  - Do not reimplement CLX-COP-4 inside BEL-1258.
  - Do not expose raw `system.message`, sensitive reasoning payloads, or full CLX-COP-6 event normalization.
  - Do not claim resume support until a successful post-turn session path is proven by tests or documented as a gap.
- Accepted tradeoffs:
  - BEL-1258 remained a high-blast-radius child task; targeted runtime tests, broader Copilot provider tests, contract tests, type validation, baseline checks, package smoke, and diff hygiene passed.
- Assumptions / Inferences:
  - BEL-1258 should be based on `origin/main` at `f5ac9fd`, which includes CLX-COP-4 / BEL-1257.

# Authoritative Sources

| Source | Retrieved at | Authority | Status | Controls |
| --- | --- | --- | --- | --- |
| Current thread | 2026-06-01T15:54:01Z | Latest user intent and decisions | loaded | Execute the brief-plan-execute sequence for BEL-1258 unless blocked by source-grounded stop conditions. |
| `/Users/jasonbelmonti/Documents/Development/claudex/AGENTS.md` | 2026-06-01T15:45:00Z | Repo-local operating rules | loaded | Use Node/npm workflows, worktrees, Vitest, execution estimation, and focused modules. |
| Linear BEL-1258 | 2026-06-01T15:47:00Z | Task contract | loaded | Defines objective, scope, success criteria, dependency on CLX-COP-4, review boundary, and validation gates. |
| Linear BEL-1257 / CLX-COP-4 | 2026-06-01T20:06:59Z | Dependency task contract | loaded | Shows BEL-1257 is `Done`, completed 2026-06-01T18:51:02Z, with PR #69 attached. |
| BEL-1257 execution brief and plan | 2026-06-01T20:06:59Z | Dependency implementation context | loaded and checksum verified | Confirms option, MCP, permission, and validation helper implementation and validation evidence. |
| Copilot SDK spike brief | 2026-06-01T15:48:00Z | Runtime lifecycle and SDK evidence | loaded and checksum verified | Controls event queue design, abort behavior, session reference caution, and non-exposure of raw internal messages. |
| Target workspace | 2026-06-01T20:06:59Z | Current implementation state | loaded | Branch `codex/bel-1258-copilot-session-runtime` fast-forwarded to `f5ac9fd`; Copilot sessions still deferred in adapter. |
| Child execution estimation | 2026-06-01T20:06:59Z | Execution gate | loaded | Refreshed proposal estimate is 13 adjusted points, high blast radius, `plan-first`, no decomposition recommended at depth 1. |
| Final implementation diff | 2026-06-01T20:25:55Z | Current implementation and validation state | loaded | Copilot runtime modules, adapter wiring, capabilities, fakes, provider tests, and contract driver are implemented. |

# Current State

- Planning / PM:
  - BEL-1258 is `Todo` in Linear and has priority High, estimate 8 points.
  - BEL-1257 / CLX-COP-4 is `Done` in Linear and merged through PR #69.
- Design:
  - Copilot runtime must use an event queue around `session.on()` and `session.send()`, not `sendAndWait()` alone.
  - `reference` should remain `null` until a successful terminal turn unless the contract is intentionally revised.
  - Runtime events must produce exactly one terminal event per turn.
- Implementation:
  - Worktree exists at `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258` on branch `codex/bel-1258-copilot-session-runtime`.
  - `origin/main` and worktree `HEAD` are `f5ac9fd`.
  - `src/providers/copilot/adapter.ts` creates/resumes Copilot sessions through the SDK facade and CLX-COP-4 config mapper.
  - Added `src/providers/copilot/session.ts`, `input.ts`, `event-queue.ts`, `events.ts`, `errors.ts`, `references.ts`, and `results.ts`.
  - Updated `src/providers/copilot/capabilities.ts` and `index.ts` for implemented session, streaming, structured-output, usage-token, and MCP session descriptor support.
  - Post-review hardening added a Copilot turn idle timeout aligned with the SDK `sendAndWait()` guard, rejects image attachments while the capability remains unclaimed, limits internal early-event capture after normalized session construction, avoids normalizing Copilot cost telemetry while `usage:cost` is unclaimed, and covers `model.call_failure` normalization.
  - `src/providers/copilot/provider-options.ts`, `mcp-options.ts`, `permissions.ts`, `validation.ts`, and CLX-COP-4 session option tests are present.
  - Added focused runtime tests in `test/providers/copilot/session.test.ts` and Copilot contract coverage in `test/contract/drivers/copilot.ts`.
- Validation:
  - Spike checksum matched the BEL-1258 required value.
  - Child execution estimation was rerun with `--decomposition-depth 1` on the refreshed base; output is stored at `.codex/execution-plans/bel-1258/child-estimation.json`.
  - Execution brief validation passed and checksum was written.
  - Execution plan validation passed and checksum was written.
  - `npm test -- test/providers/copilot/session.test.ts` passed: 1 file, 9 tests.
  - `npm test -- test/contract/session.test.ts` passed: 1 file, 18 tests.
  - `npm test -- test/contract/driver-contract.test.ts test/contract/readiness.test.ts` passed: 2 files, 4 tests.
  - `npm test -- test/providers/copilot` passed: 5 files, 39 tests.
  - `npm test -- test/contract` passed: 3 files, 22 tests.
  - `npm run typecheck`, `npm run check`, `npm run package:check`, and `git diff --check` passed.
- Known gaps:
  - Authenticated live Copilot turn and real post-turn persistence behavior remain unverified and deferred to opt-in smoke coverage.

# Execution Scope

| Scope item | Classification | Approval impact | Notes |
| --- | --- | --- | --- |
| Create/resume Copilot sessions using the SDK facade and mapped config | in-scope | blocking | Use CLX-COP-4 `buildCopilotSessionConfig()` and permission handlers. |
| Implement an async event queue around SDK callbacks | in-scope | blocking | Must avoid missed early events and uncontrolled hangs. |
| Implement terminal detection and `run()` buffering | in-scope | blocking | `run()` returns `TurnResult` on completion and throws normalized `AgentError` on terminal failure. |
| Wire abort behavior | in-scope | blocking | `TurnOptions.signal` must call `session.abort()` and normalize the aborted terminal state. |
| Preserve lifecycle ownership assumptions | in-scope | blocking | Runtime must not stop caller-owned clients unexpectedly. |
| CLX-COP-4 option, MCP, and permission mapper implementation | out-of-scope | non-blocking dependency | Completed in BEL-1257; do not reimplement it in this diff. |
| Detailed event and result mapping | out-of-scope | non-blocking | Owned by CLX-COP-6 except minimal runtime proof events. |
| Live authenticated Copilot smoke coverage | planned follow-up | non-blocking | Add later behind opt-in environment flags after unit and contract behavior is stable. |

# Materially Verifiable Success Criteria

- [x] `createSession()` returns a Copilot-backed `AgentSession` whose pre-run `reference` behavior matches the chosen claudex contract.
- [x] `resumeSession()` rejects non-Copilot references and resumes Copilot references through the SDK facade.
- [x] `runStreamed()` emits one terminal event and never hangs when SDK events end unexpectedly.
- [x] `run()` returns the completed result or throws the normalized terminal failure.
- [x] Abort tests prove `TurnOptions.signal` calls `session.abort()` and emits or throws a normalized aborted failure.
- [x] CLX-COP-4 dependency is present before coding this runtime leaf.

# Review Boundary

| Boundary | Scope | Approval impact | Notes |
| --- | --- | --- | --- |
| Runtime control flow | in-scope | blocking | Queueing, terminal ordering, abort, create/resume reference behavior, and no duplicate terminal events. |
| Lifecycle ownership | in-scope | blocking | Caller-owned clients must not be stopped by session execution unless ownership is explicit. |
| Dependency integrity | in-scope | blocking | Review should reject if BEL-1258 silently reimplements or bypasses CLX-COP-4 behavior. |
| Full event normalization detail | out-of-scope | non-blocking | CLX-COP-6 owns detailed mapping beyond minimal runtime proof events. |
| Planned follow-up work | out-of-scope | non-blocking | Non-blocking unless the current diff contradicts or prevents it. |

# Planned Follow-up Work

- Add opt-in authenticated Copilot smoke tests after unit and contract behavior is stable.
- CLX-COP-6 should complete detailed event/result mapping after runtime control flow is stable.

# Execution Plan

1. Completed adapter `createSession()` and `resumeSession()` through the SDK facade and CLX-COP-4 session config mapper.
2. Added focused Copilot session runtime modules for references, event queue, minimal event mapping, results, and errors.
3. Proved `runStreamed()` and `run()` terminal behavior, abort behavior, and lifecycle ownership with provider-local fakes.
4. Added Copilot contract driver coverage for create/resume/failure scenarios without live authentication.
5. Hardened post-review runtime behavior for missing terminal events, unsupported attachments, early-event capture scope, cost telemetry non-exposure, and `model.call_failure` coverage.
6. Ran validation gates and updated this brief with final evidence.

# Validation Gates

- Validate this brief:
  `npx -y @jasonbelmonti/markdown-engine@2.0.0 validate --file ./.codex/execution-briefs/bel-1258/execution-brief.md --profile /Users/jasonbelmonti/.codex/skills/execution-brief/profiles/execution-brief.yaml`
- Validate the execution plan:
  `python3 /Users/jasonbelmonti/.codex/skills/execution-plan/scripts/validate_execution_plan.py --file ./.codex/execution-plans/bel-1258/execution-plan.md`
- Child estimation:
  `python3 /Users/jasonbelmonti/.codex/skill-checkouts/execution-estimation/scripts/estimate_execution.py --repo-root /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258 --proposed-files /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258/.codex/execution-plans/bel-1258/estimation-proposed-files.txt --decomposition-depth 1`
- Focused runtime tests:
  `npm test -- test/providers/copilot/session.test.ts`
- Contract tests:
  `npm test -- test/contract/session.test.ts`
- Type validation:
  `npm run typecheck`
- Before handoff after implementation:
  `npm run check`

# Stop Conditions

- Plan viability contains any `blocked` decision.
- Required validation fails for reasons outside the current BEL-1258 scope.
- Implementation would need to expose raw `system.message`, sensitive reasoning payloads, or unproven resume support.
- Scope would expand to reimplement CLX-COP-4 or implement CLX-COP-6 without explicit user approval.
- Destructive git operations or credentialed live Copilot access would be required.

# Review Packet Inputs

| Field | Source section | Required mapping | Notes |
| --- | --- | --- | --- |
| `objective` | Objective | Copy the BEL-1258 runtime objective and current ready-for-execution status. | Include dependency completion. |
| `intended_behavior_change` | Objective and Execution Scope | Implement Copilot session runtime around SDK streaming callbacks. | Use CLX-COP-4 mapped config. |
| `in_scope` | Execution Scope | Include rows classified as in-scope. | Blocking review items. |
| `out_of_scope` | Execution Scope | Include CLX-COP-4 reimplementation, CLX-COP-6 detail mapping, and live smoke coverage unless scope changes. | Prevent dependency and follow-up creep. |
| `constraints` | Context / Constraints | Include worktree, Node/npm, estimation, dependency, and no raw internal payload constraints. | Preserve source authority. |
| `review_boundary` | Review Boundary | Copy the approval boundary table. | Primary review control. |
| `planned_follow_up_work` | Planned Follow-up Work | Copy each deferred item. | Non-blocking unless contradicted by the diff. |
| `test_or_risk_context` | Validation Gates | Include child estimate result, passed plan viability, and required checks. | High blast radius requires heightened controls. |

# Revision Log

| Timestamp | Actor | Change | Checksum |
| --- | --- | --- | --- |
| 2026-06-01T15:54:01Z | codex | Created BEL-1258 Execution Brief and recorded CLX-COP-4 dependency blocker. | see `execution-brief.sha256` |
| 2026-06-01T20:06:59Z | codex | Refreshed base to `f5ac9fd`, verified BEL-1257 completion, reran child estimation, and unblocked execution. | see `execution-brief.sha256` |
| 2026-06-01T20:25:55Z | codex | Recorded completed Copilot session runtime implementation and passing validation gates. | see `execution-brief.sha256` |
| 2026-06-01T21:29:53Z | codex | Recorded post-review hardening for terminal timeout, unsupported attachment rejection, early-event capture scope, and passing validation gates. | see `execution-brief.sha256` |
| 2026-06-01T21:41:54Z | codex | Recorded consensus-round fixes for Copilot cost telemetry non-exposure and `model.call_failure` coverage, plus passing validation gates. | see `execution-brief.sha256` |
