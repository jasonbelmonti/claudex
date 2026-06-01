---
title: "BEL-1257 Copilot Session Option Mapping"
brief_id: "bel-1257"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-06-01T16:17:31Z"
updated_at: "2026-06-01T17:07:47Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1257"
target_branch: "codex/bel-1257-copilot-session-options"
review_boundary_id: "RB-bel-1257"
---

# Objective

Implement BEL-1257 by mapping normalized `SessionOptions`, `agentConfig.mcpServers`, and provider-specific Copilot options into safe Copilot session configuration, including deterministic permission behavior for non-interactive modes, without implementing Copilot turn execution, event queues, or result normalization.

# Context / Constraints

- Confirmed constraints:
  - Current user instruction on 2026-06-01 requests `$execution-brief` for BEL-1257, then `$execution-plan`, then execution.
  - Work must run in repo-local worktree `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1257` on branch `codex/bel-1257-copilot-session-options`.
  - Repo instructions require Node/npm workflows, Vitest, focused modules, and execution estimation before new work.
  - BEL-1257 requires child execution estimation with `--decomposition-depth 1` before coding.
  - The package is ESM-only, targets Node `>=20`, and depends on `@github/copilot-sdk@1.0.0-beta.9`.
  - Use `task-definition` task-boundary rules when carrying Linear success criteria, validation evidence, and review-boundary language into durable artifacts.
- Dependencies:
  - Linear issue BEL-1257 controls task scope, success criteria, non-goals, and review boundary.
  - Copilot SDK spike brief checksum verified as `36ffddb6de786eb4a51296d5fee2675a2050abd6491bbfe9d98f7ac04f27b872`.
  - BEL-1256 readiness and capability reporting exists on `origin/main` at `d79a1b6`; its brief and plan checksums validate in this worktree.
  - Existing normalized contracts in `src/core/session.ts` and `src/core/agent-config.ts` define the source fields for mapping.
  - Existing Claude mapping in `src/providers/claude/provider-options.ts` and `src/providers/claude/mcp-options.ts` establishes reserved-field precedence and MCP merge patterns.
- Non-goals:
  - Do not implement Copilot event queue, `run()`, `runStreamed()`, turn result building, resume persistence, or live authenticated smoke coverage in this leaf.
  - Do not call `session.send()` in BEL-1257 implementation or tests.
  - Do not claim rich interactive approval-response workflows until a normalized response API exists.
- Accepted tradeoffs:
  - Mapper-level tests can prove safe Copilot session configuration before a runnable Copilot session adapter exists.
  - Capability notes may describe mapper support while keeping runtime session capabilities disabled until session execution is implemented.
- Assumptions / Inferences:
  - `approvalMode: "deny"` must install a permission handler that rejects requests instead of leaving them pending.
  - `approvalMode: "auto-approve-safe"` should use the SDK helper for all approvals only if the task scope accepts Copilot's provider-native safety boundary; otherwise it must fail closed. This will be resolved during implementation against SDK types.
  - `approvalMode: "interactive"` should fail closed with a typed `AgentError` until the core contract exposes approval-response handling.

# Authoritative Sources

| Source | Retrieved at | Authority | Status | Controls |
| --- | --- | --- | --- | --- |
| Current thread | 2026-06-01T16:17:31Z | Latest user intent and sequencing | loaded | Execute BEL-1257 through execution brief, execution plan, estimation, and implementation. |
| `/Users/jasonbelmonti/Documents/Development/claudex/AGENTS.md` | 2026-06-01T16:17:31Z | Repo-local operating rules | loaded | Use worktrees, Node/npm workflows, Vitest, focused modules, durable artifact protocol, and pre-work estimation. |
| Linear issue BEL-1257 | 2026-06-01T16:17:31Z | Task objective, scope, review boundary, validation gates | loaded | Defines option/MCP/permission mapping scope and non-goals. |
| Linear comments for BEL-1257 | 2026-06-01T16:17:31Z | Supplemental PM context | loaded | No comments returned. |
| Copilot SDK spike brief | 2026-06-01T16:17:31Z | SDK behavior evidence | loaded and checksum verified | Controls session config fields, MCP descriptor support, permission behavior risks, and non-goals. |
| BEL-1256 execution brief and plan | 2026-06-01T16:17:31Z | Dependency implementation context | loaded and checksum verified | Confirms readiness/capability dependency and session behavior remains deferred. |
| Worktree source state at `d79a1b6` | 2026-06-01T16:17:31Z | Current implementation state | loaded | Confirms Copilot provider identity, SDK facade, readiness, fakes, and disabled capability flags exist. |

# Current State

- Planning / PM:
  - BEL-1257 is Linear status `Todo`, priority `High`, estimate `5 Points`, project `claudex: GitHub Copilot SDK Support`.
  - Child execution estimation ran at 2026-06-01T16:23:09Z and returned `proceed-with-controls`, medium blast radius, 8 adjusted story points, `planning.recommended: true`, `planning.blocksExecution: false`, and `decompositionRecommended: false`.
- Design:
  - `SessionOptions` contains `model`, `instructions`, `workingDirectory`, `additionalDirectories`, `executionMode`, `approvalMode`, `sandboxProfile`, `resumeStrategy`, `agentConfig`, `metadata`, and `providerOptions`.
  - `AgentConfig.mcpServers` supports stdio, http, and sse descriptors.
  - Copilot SDK spike evidence says `SessionConfigBase` supports `model`, `workingDirectory`, `systemMessage`, `mcpServers`, `availableTools`, `excludedTools`, `provider`, `streaming`, and permission handlers.
  - Installed SDK types confirm `PermissionHandler` returns `approve-once`, `reject`, `user-not-available`, or related decisions; omitted handlers leave permission requests pending.
  - No normalized core approval-response API exists for interactive Copilot permission requests.
- Implementation:
  - `origin/main` includes Copilot provider identity, provider loader wiring, `CopilotAdapter`, SDK facade types, readiness checks, and fake clients/sessions.
  - `CopilotAdapter.createSession()` and `resumeSession()` currently throw normalized `unsupported_feature` errors.
  - Added `src/providers/copilot/mcp-options.ts`, `permissions.ts`, `provider-options.ts`, and `validation.ts`.
  - Updated `src/providers/copilot/types.ts` with mapper-adjacent SDK aliases and provider options, and updated provider-local exports in `src/providers/copilot/index.ts`.
  - Updated Copilot capability notes to acknowledge configuration mapping while keeping runtime session and MCP capabilities unavailable until session execution exists.
  - Post-consensus review fixes: reserved provider-native `sessionConfig` fields interpreted by the mapper now receive runtime shape validation before they can affect MCP merging, permission handling, system message fallback, or normalized-field fallback behavior. `systemMessage.sections` is only accepted for `mode: "customize"` and each section override must match the SDK shape.
  - `npm ci` installed worktree dependencies; npm reported existing audit findings outside BEL-1257 scope.
- Validation:
  - Spike checksum verified exactly as required by BEL-1257.
  - BEL-1256 brief and plan checksums verify in the BEL-1257 worktree.
  - Initial BEL-1257 execution brief and plan structural validation passed, and checksum files were written.
  - Child execution estimation permits implementation with targeted tests, owner-boundary review, and explicit authorization/failure-path coverage.
  - Focused BEL-1257 tests passed: `npm test -- test/providers/copilot/session-options.test.ts` returned 1 file, 8 tests passing.
  - Adjacent Copilot and public API regression tests passed: 5 files, 34 tests passing.
  - `npm run typecheck`, sequential `npm run check`, sequential `npm run package:check`, and `git diff --check` passed.
  - After the post-consensus provider-option containment fixes, focused tests, adjacent regression tests, `npm run typecheck`, `npm run check`, `npm run package:check`, and `git diff --check` passed again.
  - A parallel `npm run check` and `npm run package:check` attempt failed due generated `dist/` contention; sequential rerun passed and is the controlling validation result.
- Known gaps:
  - Runtime session creation, event queue, result normalization, and live authenticated Copilot behavior remain intentionally out of scope.

# Execution Scope

| Scope item | Classification | Approval impact | Notes |
| --- | --- | --- | --- |
| Map core session options | in-scope | blocking | Map model, instructions/system message, working directory, and deterministic precedence for session-owned fields. |
| Map normalized MCP descriptors | in-scope | blocking | Stdio, http, and sse descriptors must map to Copilot `mcpServers`; normalized descriptors should override provider escape-hatch entries of the same name. |
| Contain provider-specific session options | in-scope | blocking | Supported Copilot session config fields may pass through, but normalized session-owned fields must not be overridden unsafely. |
| Define permission policy | in-scope | blocking | Non-interactive modes must not leave permission requests pending; ambiguous interactive behavior must throw typed `AgentError`. |
| Capability honesty | in-scope | blocking | Capability metadata must not overclaim runnable session behavior while mapping-only support is implemented. |
| Event queue, turn execution, and result building | out-of-scope | non-blocking | Owned by later Copilot session runtime leaves. |
| Live authenticated Copilot smoke tests | out-of-scope | non-blocking | Deferred until session execution exists. |

# Materially Verifiable Success Criteria

- [x] Session option mapping tests prove normalized model, instructions, working directory, and provider-specific fields map to Copilot session config as intended.
- [x] MCP descriptor tests cover stdio, http, and sse mapping.
- [x] Provider-specific options can pass through supported Copilot session config fields without overriding normalized session-owned fields unsafely.
- [x] Permission-mode tests prove `approvalMode: "deny"` cannot leave permission requests pending.
- [x] Unsupported or ambiguous options fail with typed `AgentError` messages rather than hanging at runtime.
- [x] Invalid reserved provider-native `sessionConfig` field shapes, including MCP server maps, permission handlers, and system-message section overrides, fail with typed `AgentError` before mapper logic consumes them.
- [x] Child execution estimation with `--decomposition-depth 1` is captured before code changes.

# Review Boundary

| Boundary | Scope | Approval impact | Notes |
| --- | --- | --- | --- |
| Option mapping and precedence | in-scope | blocking | Reject if normalized ownership can be bypassed or provider-specific escape hatches override core fields silently. |
| MCP descriptor mapping | in-scope | blocking | Reject if stdio, http, or sse descriptors are dropped, malformed, or merged with unsafe precedence. |
| Permission safety | in-scope | blocking | Reject if non-interactive permission requests can hang or if ambiguous interactive mode proceeds without a normalized response path. |
| Capability honesty | in-scope | blocking | Reject if capability metadata claims runnable Copilot session support that this leaf does not implement. |
| Runtime turn behavior | out-of-scope | non-blocking | Do not require event queue, `session.send()`, result normalization, resume, or live auth tests unless this diff claims those behaviors. |

# Planned Follow-up Work

- Implement Copilot runtime session creation, event queue, turn execution, and event normalization in later leaves.
- Implement Copilot result normalization, usage mapping, structured output, and terminal turn behavior in later leaves.
- Add opt-in live authenticated Copilot smoke coverage after runnable session support exists.
- Revisit interactive approval-response support when the core contract exposes a normalized response API.

# Execution Plan

1. Validate this execution brief and create `.codex/execution-plans/bel-1257/execution-plan.md`.
2. Run child execution estimation with `--decomposition-depth 1` from the plan file-touch list; the gate passed with `proceed-with-controls`.
3. Installed dependencies with `npm ci` and inspected Copilot SDK permission/config types.
4. Implemented focused Copilot modules for MCP mapping, provider option containment, permission policy, session config mapping, and validation.
5. Added focused tests in `test/providers/copilot/session-options.test.ts`.
6. Ran focused tests, adjacent regressions, type validation, baseline validation, package smoke, and diff hygiene.

# Validation Gates

- Validate this brief:
  `npx -y @jasonbelmonti/markdown-engine@2.0.0 validate --file ./.codex/execution-briefs/bel-1257/execution-brief.md --profile /Users/jasonbelmonti/.codex/skills/execution-brief/profiles/execution-brief.yaml`
- Validate execution plan:
  `python3 /Users/jasonbelmonti/.codex/skills/execution-plan/scripts/validate_execution_plan.py --file ./.codex/execution-plans/bel-1257/execution-plan.md`
- Run child execution estimation before coding:
  `python3 /Users/jasonbelmonti/.codex/skill-checkouts/execution-estimation/scripts/estimate_execution.py --repo-root /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1257 --proposed-files ./.codex/execution-plans/bel-1257/proposed-files.txt --decomposition-depth 1`
- Dependency install if needed:
  `npm ci`
- Focused tests:
  `npm test -- test/providers/copilot/session-options.test.ts`
- Type validation:
  `npm run typecheck`
- Baseline validation:
  `npm run check`
- Diff hygiene:
  `git diff --check`

# Stop Conditions

- Stop before coding if child execution estimation returns `decompose-first`, `plan-first`, blocks execution, or recommends decomposition.
- Stop if a named material source becomes unavailable or conflicts with the loaded issue/brief scope.
- Stop if Copilot SDK types do not expose a deterministic way to reject permission requests in non-interactive modes.
- Stop if implementing safe option mapping requires runnable session execution, event queue, result normalization, or live credentials.
- Stop if capability changes would claim behavior not proven by this leaf.
- Stop before destructive git operations or credentialed live Copilot access.

# Review Packet Inputs

| Field | Source section | Required mapping | Notes |
| --- | --- | --- | --- |
| `objective` | Objective | Copy BEL-1257 objective. | Focus on safe session config mapping only. |
| `intended_behavior_change` | Objective and Execution Plan | Copilot gets deterministic session config, MCP, provider-option, and permission mapping helpers. | No turn execution. |
| `in_scope` | Execution Scope | Include in-scope rows. | Blocking review items. |
| `out_of_scope` | Execution Scope and Planned Follow-up Work | Include runtime turn/session execution rows. | Non-blocking unless current diff claims support. |
| `constraints` | Context / Constraints | Include worktree, Node/npm, estimation, SDK type, non-interactive permission, and session-runtime constraints. | Preserve source authority. |
| `review_boundary` | Review Boundary | Copy approval boundaries. | Prevent runtime/session scope creep. |
| `planned_follow_up_work` | Planned Follow-up Work | Copy deferred items. | Non-blocking. |
| `test_or_risk_context` | Validation Gates and Current State | Include estimation, focused tests, typecheck, and SDK type confirmation. | Record skipped gates plainly. |

# Revision Log

| Timestamp | Actor | Change | Checksum |
| --- | --- | --- | --- |
| 2026-06-01T16:17:31Z | codex | Created initial Execution Brief for BEL-1257 from Linear issue, repo instructions, spike evidence, BEL-1256 dependency state, and worktree source state. | pending |
| 2026-06-01T16:23:09Z | codex | Recorded passed artifact validation/checksum creation and child execution estimation gate. | pending |
| 2026-06-01T16:33:04Z | codex | Recorded completed implementation, SDK type evidence, and passing validation gates. | pending |
| 2026-06-01T16:50:35Z | codex | Recorded consensus-review containment fix for malformed reserved provider `sessionConfig` fields and rerun validation gates. | pending |
| 2026-06-01T16:58:59Z | codex | Recorded consensus-review containment fix for malformed provider `systemMessage.sections` overrides and rerun validation gates. | pending |
| 2026-06-01T17:07:47Z | codex | Recorded consensus-review containment fix requiring `systemMessage.sections` only with `mode: "customize"` and rerun validation gates. | pending |
