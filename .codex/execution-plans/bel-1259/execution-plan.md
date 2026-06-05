---
title: "BEL-1259 Execution Plan"
plan_id: "bel-1259"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-06-05T01:21:49Z"
updated_at: "2026-06-05T01:40:58Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1259"
target_branch: "codex/bel-1259-copilot-normalization"
source_packet: ".codex/execution-briefs/bel-1259/execution-brief.md"
estimation_mode: "proposal"
validation_profile: "profiles/execution-plan.yaml"
---

# Objective

Execute the skipped `BEL-1259` Copilot normalization delta by adding cautious file-change and approval event mapping, preserving Copilot usage metadata through normalized results, and proving sensitive runtime/reasoning events are omitted by default while preserving already-merged Copilot runtime behavior.

# Source Inventory

| Source | Retrieved at | Authority | Status | Plan impact |
| --- | --- | --- | --- | --- |
| Current user instruction | 2026-06-05T01:21:49Z | Latest operating route | loaded | Requires brief, plan, execution, review passes, consensus review, and PR. |
| `AGENTS.md` | 2026-06-05T01:21:49Z | Repo-local execution rules | loaded | Use worktree, Node/npm, Vitest, focused modules, `npm run check`. |
| `.codex/execution-briefs/bel-1259/execution-brief.md` | 2026-06-05T01:21:49Z | Durable task snapshot | loaded and checksum written | Controls objective, scope, review boundary, gates, and stop conditions. |
| Linear `BEL-1259` | 2026-06-05T01:21:49Z | Task contract | loaded | Defines event/result normalization success criteria. |
| Copilot SDK spike brief | 2026-06-05T01:21:49Z | SDK event and sensitivity source | loaded and checksum verified | Controls event families and sensitive event non-exposure. |
| Current Copilot provider code | 2026-06-05T01:21:49Z | Implementation state | loaded | Defines partial behavior and likely touched files. |
| Execution estimation | 2026-06-05T01:21:49Z | Planning gate | loaded | `plan-first`, high blast radius, heightened controls, no decomposition. |

# Planning Constraints

- Confirmed constraints:
  - Work in `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1259`.
  - Do not code before this plan validates and is read back.
  - Run targeted tests and broader checks because estimation marked high blast radius.
  - Keep changes inside Copilot provider-owned mapping, tests, and capability metadata unless inspection proves a shared contract change is required.
- Dependencies:
  - Existing Copilot runtime/event queue from `BEL-1258`.
  - Existing core event and result contracts.
- Non-goals:
  - Authenticated live smoke, package release checks, final docs integration, passive ingest, and rich reasoning summary support.
- Assumptions / Inferences:
  - Fake event factories can model the missing Copilot SDK events with `Extract<CopilotSessionEvent, ...>` types.
  - Capability metadata can be updated for file-change and approval events once focused tests validate those mappings.
- Missing inputs:
  - None blocking before execution. Exact payload field names for file-change and approval events must be inspected before implementation; failure to find stable shapes is a stop condition.

# Target Completion Route

The route is complete. SDK event payload types and the existing fake event surface were inspected; focused tests were added for the missing `BEL-1259` behavior; minimal Copilot provider mapper/result changes were implemented; capability metadata was updated only for newly proven behavior; targeted provider tests, contract tests, baseline checks, abstraction/refactor reviews, test-value review, and three-reviewer consensus review completed with no validated blockers before commit and PR.

# Execution Steps

| Step | Action | Target | Depends on | Evidence | Stop condition |
| --- | --- | --- | --- | --- | --- |
| 1 | Inspect Copilot event payload types and current fake event helpers for missing event families. | `node_modules/@github/copilot-sdk/dist`, `src/providers/copilot/types.ts`, `test/providers/copilot/event-factories.ts` | Validated plan | Payload field names and uncertainty are known. | SDK declarations do not expose stable shapes for file-change or approval events. |
| 2 | Add focused failing tests for file-change, approval, provider usage, and sensitive omission behavior. | `test/providers/copilot/event-factories.ts`, `test/providers/copilot/session.test.ts` or focused events test | Step 1 | Tests encode the missing stable contract. | Required scenario needs live auth or a public approval response API. |
| 3 | Implement Copilot event mapping for file-change and approval events. | `src/providers/copilot/events.ts` and local owned helpers if needed | Step 2 | New tests pass for normalized event shapes. | Mapping requires unsafe payload exposure or overclaims path semantics. |
| 4 | Preserve Copilot provider usage metadata in normalized usage. | `src/providers/copilot/results.ts` | Step 2 | Result tests show `usage.providerUsage` plus existing token values. | Usage payload type is too unstable to preserve safely. |
| 5 | Update capability metadata for behavior proven by tests. | `src/providers/copilot/capabilities.ts`, capability tests if needed | Steps 3 and 4 | Capabilities match implemented event support without overclaiming cost/reasoning. | Metadata would conflict with docs or contract behavior. |
| 6 | Run targeted provider tests and contract tests. | `npm test -- test/providers/copilot/session.test.ts`; `npm test -- test/contract` | Steps 3-5 | Both commands pass. | Failure is outside current scope or exposes a broader contract issue. |
| 7 | Run baseline and review passes. | `npm run check`; SOLID, simplifier, boundary, test-value, consensus review | Step 6 | No validated blockers remain. | Consensus validates a blocker requiring scope change. |
| 8 | Commit, push, and open PR. | Branch `codex/bel-1259-copilot-normalization` | Step 7 | Remote branch and PR URL exist. | GitHub access or PR creation fails. |

# File Touch Plan

| Path | Change type | Purpose | Expected churn | Risk notes |
| --- | --- | --- | --- | --- |
| `src/providers/copilot/events.ts` | update | Add file-change and approval event mapping; preserve sensitive-event omission. | medium | Core event shape correctness and raw payload sensitivity. |
| `src/providers/copilot/results.ts` | update | Preserve Copilot provider usage metadata in normalized usage. | small | Must not break existing token usage contract. |
| `src/providers/copilot/capabilities.ts` | update | Reflect validated file-change and approval support only. | small | Avoid overclaiming cost, reasoning, or live behavior. |
| `test/providers/copilot/event-factories.ts` | update | Add typed fake events for missing Copilot event families. | medium | Use SDK extract types to avoid drift. |
| `test/providers/copilot/fakes.ts` | update if needed | Re-export new fake event factories. | small | Keep test imports coherent. |
| `test/providers/copilot/session.test.ts` | update | Add focused coverage for missing behavior and regression protection. | medium | Avoid duplicating existing contract tests. |
| `test/providers/copilot/events.test.ts` | add if boundary split is clearer | Keep pure event-mapping fixtures separate from runtime orchestration. | medium | Use only if it improves ownership clarity. |
| `test/contract/drivers/copilot.ts` | update if needed | Preserve contract expectations when provider usage or capabilities are asserted. | small | High blast-radius contract boundary. |
| `.codex/execution-briefs/bel-1259/execution-brief.md` | update | Record material execution status before review if needed. | small | Must validate and checksum after material updates. |
| `.codex/execution-plans/bel-1259/execution-plan.md` | update | Record material route changes if discovered. | small | Must validate and checksum after material updates. |

# Estimation Inputs

| Field | Value | Notes |
| --- | --- | --- |
| `repoRoot` | `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1259` | Worktree owns the diff. |
| `mode` | `proposal` before coding; `diff` after implementation | Initial estimate already ran from parent repo with proposed files and `--decomposition-depth 1`. |
| `proposedFiles` | Derive from File Touch Plan paths excluding optional rows if untouched. | Newline-delimited list is sufficient. |
| `proposalLinesChanged` | `unknown` | Do not override unless actual plan diverges materially. |
| `baseRef` | `origin/main` | Use for diff-backed sizing or review packet. |
| `headRef` | `HEAD` | Use current branch after implementation. |
| `includeWorkingTree` | `true` for pre-commit diff reviews | Uncommitted implementation is in scope until commit. |

# Validation Gates

| Gate | Command or check | Required evidence | Owner |
| --- | --- | --- | --- |
| Plan validation wrapper | `python3 /Users/jasonbelmonti/.codex/skills/execution-plan/scripts/validate_execution_plan.py --file ./.codex/execution-plans/bel-1259/execution-plan.md` | Wrapper validation passes before execution. | codex |
| Plan checksum | `shasum -a 256 ./.codex/execution-plans/bel-1259/execution-plan.md > ./.codex/execution-plans/bel-1259/execution-plan.sha256` | Checksum file exists and plan is read back. | codex |
| Targeted provider tests | `npm test -- test/providers/copilot/session.test.ts test/providers/copilot/readiness.test.ts` | Focused Copilot runtime/mapping tests passed: 34 tests. | codex |
| Contract tests | `npm test -- test/contract` | Shared contract harness remains green. | codex |
| Baseline check | `npm run check` | Lint, typecheck, and build pass. | codex |
| Review pass | SOLID, simplifier, boundary, test-value, consensus review | Completed with no validated blockers; all three consensus reviewers returned APPROVE. | codex |

# Stop Conditions

- A named material source becomes unavailable.
- Sources conflict and the controlling source cannot be determined.
- The route requires destructive operations, new credentials, or external access not already approved.
- The expected file touch plan expands enough to change sizing or decomposition.
- Required validation fails for reasons outside the current scope.
- SDK payload declarations do not support stable file-change or approval mapping.
- Sensitive raw prompt or reasoning payload exposure would be required to satisfy a mapping.
- Consensus review validates a blocker that requires changing the task contract.

# Plan Viability Review

| Review area | Viability question | Reviewer notes | Decision | Required revision |
| --- | --- | --- | --- | --- |
| Source authority | Are all material sources loaded or explicitly marked as missing? | Current instruction, repo instructions, Linear issue, spike brief, current code, and estimation are loaded. Exact SDK payload inspection is sequenced before implementation and not blocking plan viability. | pass | None. |
| Route feasibility | Can the route be executed with current access, dependencies, and constraints? | Worktree access, Node/npm scripts, SDK declarations, and existing fake test seams are available. No credentialed live smoke is required. | pass | None. |
| Dependency order | Are prerequisite inspections, changes, and validations sequenced before dependent work? | SDK payload inspection precedes tests and mapping; tests precede implementation; validation and reviews precede commit/PR. | pass | None. |
| Validation evidence | Can the validation gates prove the intended outcome objectively? | Targeted tests prove event/result behavior, contract tests prove shared boundaries, `npm run check` proves local baseline, and consensus review checks blockers. | pass | None. |
| Estimation readiness | Can execution sizing derive proposal or diff inputs from the plan? | File Touch Plan and Estimation Inputs provide proposed and diff-backed inputs. | pass | None. |
| Execution commitment | Is the plan ready to use as execution context without hidden blockers? | The only unknown is payload field shape, and it is handled as Step 1 with explicit stop conditions. | pass | None. |

# Plan Readiness Check

| Check | Requirement | Evidence | Status |
| --- | --- | --- | --- |
| Placeholder sweep | No unresolved template placeholders remain in the artifact. | Manual sweep completed; validation wrapper will enforce. | pass |
| Source completeness | Material sources are loaded or listed as missing inputs. | Source Inventory contains all controlling sources; exact SDK payload inspection is an execution step. | pass |
| Step specificity | Each execution step has an action, target, dependency, evidence, and stop condition. | Execution Steps table is complete. | pass |
| Viability review | Plan viability is reviewed before execution commitment. | Plan Viability Review decisions are all pass. | pass |
| Estimation readiness | File or diff inputs can be passed to an execution sizing workflow. | Estimation Inputs and File Touch Plan are complete. | pass |
| Validation readiness | Required commands or manual checks have evidence expectations. | Validation Gates table is complete. | pass |

# Review Handoff

- Review boundary: Judge whether the diff completes the `BEL-1259` delta for Copilot event/result normalization, preserves existing runtime behavior, and prevents sensitive event exposure.
- Out of scope: Authenticated live smoke, package/release checks, passive ingest, rich reasoning summaries, and broad `BEL-1260` docs work.
- Planned follow-up work: `BEL-1260` docs/smoke/package integration, reasoning-summary safety proof, passive ingest.
- Evidence to include: Execution Brief path and checksum, Execution Plan path and checksum, targeted provider tests, contract tests, `npm run check`, local diff, and review pass outputs.

# Revision Log

| Timestamp | Actor | Change | Artifact checksum reference |
| --- | --- | --- | --- |
| 2026-06-05T01:21:49Z | codex | Created initial `BEL-1259` Execution Plan. | pending; write `execution-plan.sha256` after validation |
| 2026-06-05T01:40:58Z | codex | Recorded completed execution route, passing validation gates, and clean consensus review. | pending; write `execution-plan.sha256` after validation |
