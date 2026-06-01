---
title: "BEL-1258 Copilot Session Runtime Execution Plan"
plan_id: "bel-1258"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-06-01T15:54:01Z"
updated_at: "2026-06-01T21:41:54Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258"
target_branch: "codex/bel-1258-copilot-session-runtime"
source_packet: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258/.codex/execution-briefs/bel-1258/execution-brief.md"
estimation_mode: "proposal"
validation_profile: "/Users/jasonbelmonti/.codex/skills/execution-plan/profiles/execution-plan.yaml"
---

# Objective

Define and execute the source-grounded route for BEL-1258 / CLX-COP-5: implement Copilot session runtime and streaming control flow on top of the completed CLX-COP-4 session option, MCP, and permission policy mapper. Implementation and validation are complete and ready for review.

# Source Inventory

| Source | Retrieved at | Authority | Status | Plan impact |
| --- | --- | --- | --- | --- |
| Current thread | 2026-06-01T15:54:01Z | Latest user intent and decisions | loaded | Requests execution brief, execution plan, then execution for BEL-1258. |
| `/Users/jasonbelmonti/Documents/Development/claudex/AGENTS.md` | 2026-06-01T15:45:00Z | Repo-local operating rules | loaded | Requires Node/npm workflows, Vitest, worktrees, focused modules, and execution estimation before new work. |
| Execution Brief BEL-1258 | 2026-06-01T20:06:59Z | Durable execution source packet | loaded | Records objective, source authority, review boundary, validation gates, and unblocked state. |
| Linear BEL-1258 | 2026-06-01T15:47:00Z | Task contract | loaded | Defines runtime scope, success criteria, dependency on CLX-COP-4, and validation requirements. |
| Linear BEL-1257 / CLX-COP-4 | 2026-06-01T20:06:59Z | Dependency task contract | loaded | Confirms required session config and permission policy dependency is `Done`, completed 2026-06-01T18:51:02Z, with PR #69 attached. |
| BEL-1257 execution brief and plan | 2026-06-01T20:06:59Z | Dependency implementation context | loaded and checksum verified | Confirms option, MCP, permission, validation helper implementation and validation evidence. |
| Copilot SDK spike brief | 2026-06-01T15:48:00Z | Runtime lifecycle and SDK evidence | loaded and checksum verified | Requires `session.on()` plus `session.send()`, abort wiring, cautious references, and internal-message redaction. |
| Target workspace | 2026-06-01T20:06:59Z | Current implementation state | loaded | `HEAD` is `f5ac9fd`; Copilot sessions are still deferred and CLX-COP-4 files are present. |
| Child execution estimation | 2026-06-01T20:06:59Z | Sizing and execution gate | loaded | Refreshed proposal output says 13 adjusted points, high blast radius, `plan-first`, no decomposition recommended at depth 1. |
| Final implementation diff | 2026-06-01T20:25:55Z | Current implementation and validation state | loaded | Runtime implementation, tests, contract coverage, and validation gates are complete. |

# Planning Constraints

- Confirmed constraints: Use the BEL-1258 worktree at `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258`; use Node/npm and Vitest; run child estimation with `--decomposition-depth 1`; proceed with high-blast-radius controls.
- Dependencies: CLX-COP-4 / BEL-1257 session option mapping, MCP mapping, and permission policy exist on the refreshed base.
- Non-goals: Do not implement CLX-COP-4 inside this route; do not complete CLX-COP-6 detailed event/result mapping; do not claim live authenticated or post-turn resume behavior before tests prove it.
- Assumptions / Inferences: After CLX-COP-4 lands, BEL-1258 can stay as one child task because the estimator suppressed further decomposition at depth 1.
- Missing inputs: None blocking current execution.

# Target Completion Route

Completed the Copilot session runtime in ordered slices: adapter create/resume, session reference handling, local async event queue, minimal runtime event/result normalization, terminal detection, abort handling, focused provider tests, and Copilot contract coverage. Post-review hardening added a deterministic idle timeout, explicit unsupported-attachment rejection while image input is unclaimed, scoped early-event capture, cost telemetry non-exposure while `usage:cost` is unclaimed, and `model.call_failure` coverage. CLX-COP-6 detail mapping and live authenticated smoke coverage remain out of scope.

# Execution Steps

| Step | Action | Target | Depends on | Evidence | Stop condition |
| --- | --- | --- | --- | --- | --- |
| 1 | Verified current source packet, dependency state, and child estimation. | Execution Brief, Linear BEL-1258, Linear BEL-1257, BEL-1257 artifacts, worktree source files, child estimate | None | BEL-1258 brief/plan exist; BEL-1257 is done and merged; refreshed child estimate says no decomposition recommended. | Complete. |
| 2 | Implemented adapter create/resume through SDK facade and mapped config. | `src/providers/copilot/adapter.ts`, `session.ts`, `references.ts`, `types.ts` | Step 1 | Tests prove Copilot references are rejected or accepted correctly and pre-run reference behavior matches contract. | Complete. |
| 3 | Implemented event queue, terminal detection, and `run()` buffering. | `event-queue.ts`, `events.ts`, `results.ts`, `errors.ts`, `session.ts` | Step 2 | Fake session tests prove no missed early events, one terminal event, no stream hang, completed result return, and normalized failure throw. | Complete. |
| 4 | Wired abort behavior and lifecycle cleanup assumptions. | `session.ts`, `errors.ts`, fake session/client tests | Step 3 | Tests prove `TurnOptions.signal` calls `session.abort()` and emits or throws normalized aborted failure without stopping caller-owned clients unexpectedly. | Complete. |
| 5 | Added Copilot contract driver coverage. | `test/contract/drivers/copilot.ts`, `test/contract/drivers/index.ts`, provider-local tests | Step 4 | Contract tests cover create/resume, provider failure, structured-output failure, terminal ordering, and no fork support. | Complete. |
| 6 | Hardened post-review runtime behavior for missing terminal events, unsupported attachments, early-event capture scope, cost telemetry non-exposure, and `model.call_failure` coverage. | `adapter.ts`, `session.ts`, `input.ts`, `errors.ts`, `results.ts`, `types.ts`, `event-factories.ts`, `session.test.ts` | Step 5 | Provider-local tests prove terminal timeout, unsupported attachments, and model call failure normalization; typecheck passes. | Complete. |
| 7 | Ran required verification and updated durable artifacts with final evidence. | Vitest, typecheck, check, package check, diff hygiene, brief, plan | Step 6 | Required commands passed and artifacts were updated for review. | Complete. |

# File Touch Plan

| Path | Change type | Purpose | Expected churn | Risk notes |
| --- | --- | --- | --- | --- |
| `src/providers/copilot/adapter.ts` | update | Replace deferred session errors with create/resume wiring through SDK facade and mapped config. | medium | Must not bypass CLX-COP-4 or stop caller-owned clients unexpectedly. |
| `src/providers/copilot/index.ts` | update | Export provider-local runtime modules. | low | Keep package surface internally consistent. |
| `src/providers/copilot/session.ts` | add | Implement `AgentSession` runtime, `run()`, `runStreamed()`, abort handling, and terminal state. | high | Auth, lifecycle, and terminal ordering boundary; requires focused tests. |
| `src/providers/copilot/input.ts` | add | Map normalized turn input/options into Copilot message and runtime options. | low | Must reject attachments until image input is verified and capability is claimed. |
| `src/providers/copilot/event-queue.ts` | add | Buffer SDK callback events into an async generator-safe queue. | medium | Must handle early events, completion, errors, cancellation, and cleanup. |
| `src/providers/copilot/events.ts` | add | Map only minimal runtime proof events needed by BEL-1258. | medium | Do not expose raw internal messages or full CLX-COP-6 semantics. |
| `src/providers/copilot/errors.ts` | add | Normalize Copilot runtime, abort, and terminal failure errors into `AgentError`. | medium | Failure classification must be deterministic. |
| `src/providers/copilot/references.ts` | add | Create and validate Copilot session references. | low | Must reject non-Copilot references. |
| `src/providers/copilot/results.ts` | add | Build minimal `TurnResult` from terminal message state. | medium | Resume support should not be overclaimed. |
| `src/providers/copilot/capabilities.ts` | update | Enable implemented session and streaming capabilities only after tests prove behavior. | low | Avoid overclaiming CLX-COP-6, resume, usage, or live smoke support. |
| `src/providers/copilot/types.ts` | update | Add test seams and local types needed for runtime modules. | low | Preserve facade around SDK types. |
| `test/providers/copilot/session.test.ts` | add | Focused create/resume/run/runStreamed/abort tests. | high | Must cover no terminal, duplicate terminal, abort, and unexpected SDK failure paths. |
| `test/providers/copilot/fake-session.ts` | update | Support async event sequencing, hangs, errors, abort assertions, and listener cleanup. | medium | Fake behavior must match SDK callback semantics enough to prove control flow. |
| `test/providers/copilot/fake-client.ts` | update | Support create/resume runtime tests and ownership assertions. | low | Avoid brittle implementation-only tests. |
| `test/providers/copilot/event-factories.ts` | update | Add minimal event factories for terminal, failure, and delta scenarios. | low | Keep mapping detail bounded to BEL-1258. |
| `test/contract/drivers/copilot.ts` | add | Add Copilot contract driver once runtime is available. | medium | Contract must not require live auth. |
| `test/contract/drivers/index.ts` | update | Register Copilot in the shared contract driver list. | low | Public contract provider list must include implemented Copilot runtime. |
| `test/providers/copilot/readiness.test.ts` | update | Refresh capability and adapter assertions now that sessions are implemented. | low | Avoid stale deferred-session assertions. |

# Estimation Inputs

| Field | Value | Notes |
| --- | --- | --- |
| `repoRoot` | `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258` | BEL-1258 worktree. |
| `mode` | `proposal` | No implementation diff exists yet. |
| `proposedFiles` | `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258/.codex/execution-plans/bel-1258/estimation-proposed-files.txt` | Newline-delimited list derived from File Touch Plan. |
| `proposalLinesChanged` | `not set` | Estimator heuristic used 1,350 changed lines for 15 files. |
| `baseRef` | `origin/main` | Current worktree branch tracks `origin/main` at `f5ac9fd`. |
| `headRef` | `codex/bel-1258-copilot-session-runtime` | Same commit as `origin/main` before implementation. |
| `includeWorkingTree` | `false` | Estimation was proposal-based before implementation. |
| `childEstimate` | `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258/.codex/execution-plans/bel-1258/child-estimation.json` | Refreshed estimate: 13 adjusted points, high blast radius, `plan-first`, no decomposition recommended at depth 1. |

# Validation Gates

| Gate | Command or check | Required evidence | Owner |
| --- | --- | --- | --- |
| Brief validation | `npx -y @jasonbelmonti/markdown-engine@2.0.0 validate --file ./.codex/execution-briefs/bel-1258/execution-brief.md --profile /Users/jasonbelmonti/.codex/skills/execution-brief/profiles/execution-brief.yaml` | Brief validates and checksum file exists. | codex |
| Plan validation wrapper | `python3 /Users/jasonbelmonti/.codex/skills/execution-plan/scripts/validate_execution_plan.py --file ./.codex/execution-plans/bel-1258/execution-plan.md` | Wrapper validation passes before handoff, including markdown-engine profile validation and full-document placeholder checks. | codex |
| Child estimation | `python3 /Users/jasonbelmonti/.codex/skill-checkouts/execution-estimation/scripts/estimate_execution.py --repo-root /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258 --proposed-files /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1258/.codex/execution-plans/bel-1258/estimation-proposed-files.txt --decomposition-depth 1` | Output captured in `child-estimation.json`; no decomposition recommended. | codex |
| Dependency verification | Inspect CLX-COP-4 files and tests before BEL-1258 coding. | `provider-options.ts`, `mcp-options.ts`, `permissions.ts`, `validation.ts`, and session option tests exist. | codex |
| Focused runtime tests | `npm test -- test/providers/copilot/session.test.ts` | Create/resume/run/runStreamed/abort/timeout/unsupported-attachment/model-call-failure behavior passes with fakes. | codex |
| Contract tests | `npm test -- test/contract/session.test.ts` | Copilot contract scenarios pass without live auth. | codex |
| Type validation | `npm run typecheck` | TypeScript passes. | codex |
| Baseline check | `npm run check` | Lint, typecheck, and build pass before handoff. | codex |
| Broader provider regression | `npm test -- test/providers/copilot` | Copilot provider tests pass after fake and readiness updates. | codex |
| Full contract regression | `npm test -- test/contract` | Shared contract tests pass with Copilot registered. | codex |
| Package artifact smoke | `npm run package:check` | Packed artifact smoke passes. | codex |
| Diff hygiene | `git diff --check` | No whitespace errors. | codex |

# Stop Conditions

- Any Plan Viability Review row remains `blocked`.
- Child estimation changes to `decompose-first` or `decompositionRecommended: true` after the dependency base is refreshed.
- Required runtime tests cannot prove exactly one terminal event per turn.
- Abort handling cannot deterministically call `session.abort()` and produce a normalized aborted failure.
- Implementation would expose raw `system.message`, sensitive reasoning payloads, or unverified resume support.
- Required validation fails for a reason outside the BEL-1258 boundary.

# Plan Viability Review

| Review area | Viability question | Reviewer notes | Decision | Required revision |
| --- | --- | --- | --- | --- |
| Source authority | Are all material sources loaded or explicitly marked as missing? | Current thread, repo instructions, BEL-1258, BEL-1257, BEL-1257 artifacts, spike brief, workspace state, and refreshed child estimate are loaded. | pass | None. |
| Route feasibility | Can the route be executed with current access, dependencies, and constraints? | Yes. BEL-1257 is done and merged into the refreshed base, dependencies are local, and implementation can proceed with heightened controls. | pass | None. |
| Dependency order | Are prerequisite inspections, changes, and validations sequenced before dependent work? | Yes. The route stops at dependency verification before any runtime code and sequences estimation before implementation. | pass | None. |
| Validation evidence | Can the validation gates prove the intended outcome objectively? | Yes. Gates cover brief, plan, child estimate, dependency verification, focused runtime tests, contract tests, typecheck, and baseline check. | pass | None. |
| Estimation readiness | Can execution sizing derive proposal or diff inputs from the plan? | Yes. File Touch Plan and `estimation-proposed-files.txt` provide proposal-mode inputs, and the child estimate output is captured. | pass | None. |
| Execution commitment | Is the plan ready to use as execution context without hidden blockers? | Yes. No decomposition is recommended at depth 1; high blast radius is handled through targeted tests, contract tests, typecheck, and baseline check gates. | pass | None. |

# Plan Readiness Check

| Check | Requirement | Evidence | Status |
| --- | --- | --- | --- |
| Placeholder sweep | No unresolved template placeholders remain in the artifact. | Validation wrapper and manual scan are required before handoff. | pass |
| Source completeness | Material sources are loaded or listed as missing inputs. | Source Inventory lists all controlling sources and no blocking missing inputs remain. | pass |
| Step specificity | Each execution step has an action, target, dependency, evidence, and stop condition. | Execution Steps table is complete and starts with dependency verification. | pass |
| Viability review | Plan viability is reviewed before execution commitment. | Plan Viability Review is complete and all rows pass on the refreshed base. | pass |
| Estimation readiness | File or diff inputs can be passed to an execution sizing workflow. | Estimation Inputs and proposed file list are complete. | pass |
| Validation readiness | Required commands or manual checks have evidence expectations. | Validation Gates table is complete. | pass |

# Review Handoff

- Review boundary: Judge whether BEL-1258 runtime control flow uses CLX-COP-4 mapping and rejects silent dependency bypasses, hangs, duplicate terminal events, unsafe abort behavior, and lifecycle ownership regressions.
- Out of scope: CLX-COP-4 reimplementation, CLX-COP-6 detailed event/result mapping, live authenticated smoke coverage, raw internal message exposure, and unproven resume claims.
- Planned follow-up work: Later add opt-in live Copilot smoke and CLX-COP-6 detail mapping.
- Evidence to include: Brief checksum, plan checksum, child estimate output, dependency verification evidence, targeted runtime tests, broader Copilot provider tests, contract tests, typecheck, baseline check, package smoke, and diff hygiene.

# Revision Log

| Timestamp | Actor | Change | Artifact checksum reference |
| --- | --- | --- | --- |
| 2026-06-01T15:54:01Z | codex | Created BEL-1258 Execution Plan with blocked viability due missing CLX-COP-4 dependency. | see `execution-plan.sha256` |
| 2026-06-01T20:06:59Z | codex | Fast-forwarded to `f5ac9fd`, verified BEL-1257 completion, reran child estimation, and revised viability to pass. | see `execution-plan.sha256` |
| 2026-06-01T20:25:55Z | codex | Recorded completed Copilot session runtime implementation and passing validation gates. | see `execution-plan.sha256` |
| 2026-06-01T21:29:53Z | codex | Recorded post-review hardening for terminal timeout, unsupported attachment rejection, early-event capture scope, and passing validation gates. | see `execution-plan.sha256` |
| 2026-06-01T21:41:54Z | codex | Recorded consensus-round fixes for Copilot cost telemetry non-exposure and `model.call_failure` coverage, plus passing validation gates. | see `execution-plan.sha256` |
