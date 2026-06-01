---
title: "BEL-1257 Execution Plan"
plan_id: "bel-1257"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-06-01T16:17:31Z"
updated_at: "2026-06-01T17:07:47Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1257"
target_branch: "codex/bel-1257-copilot-session-options"
source_packet: ".codex/execution-briefs/bel-1257/execution-brief.md"
estimation_mode: "proposal"
validation_profile: "/Users/jasonbelmonti/.codex/skills/execution-plan/profiles/execution-plan.yaml"
---

# Objective

Implement BEL-1257 by adding focused Copilot session configuration mapping for normalized session options, MCP descriptors, provider-specific session config fields, and deterministic permission behavior, without implementing Copilot turn execution or result normalization.

# Source Inventory

| Source | Retrieved at | Authority | Status | Plan impact |
| --- | --- | --- | --- | --- |
| Current thread | 2026-06-01T16:17:31Z | Latest user intent and sequencing | loaded | Requires execution brief, execution plan, then execution. |
| `AGENTS.md` | 2026-06-01T16:17:31Z | Repo-local operating rules | loaded | Requires repo worktree, Node/npm workflows, Vitest, durable artifact protocol, and execution estimation. |
| Linear issue BEL-1257 | 2026-06-01T16:17:31Z | Task objective, scope, validation, review boundary | loaded | Defines option mapping, MCP, permission policy, non-goals, and child estimation requirement. |
| Linear comments for BEL-1257 | 2026-06-01T16:17:31Z | Supplemental PM context | loaded | No comments returned. |
| Copilot SDK spike brief | 2026-06-01T16:17:31Z | SDK behavior evidence | loaded and checksum verified | Controls supported session config fields, MCP types, permission risks, and runtime non-goals. |
| BEL-1256 execution brief and plan | 2026-06-01T16:17:31Z | Dependency implementation context | loaded and checksum verified | Confirms Copilot readiness/capability dependency exists and session runtime remains deferred. |
| `.codex/execution-briefs/bel-1257/execution-brief.md` | 2026-06-01T16:17:31Z | Durable execution snapshot | loaded | Controls BEL-1257 scope, validation gates, stop conditions, and review boundary. |
| Worktree source state at `d79a1b6` | 2026-06-01T16:17:31Z | Current implementation state | loaded | Confirms current Copilot provider files and identifies missing session-option mapping modules/tests. |

# Planning Constraints

- Confirmed constraints: Run child execution estimation with `--decomposition-depth 1` before coding; use Node/npm workflows and Vitest; keep modules focused by separating MCP mapping, provider-option mapping, permissions, and validation.
- Dependencies: `@github/copilot-sdk@1.0.0-beta.9` is declared in `package.json`; `node_modules` is absent in the BEL-1257 worktree and must be installed before npm validation or direct SDK type inspection.
- Non-goals: No Copilot `session.send()`, event queue, turn result normalization, resume persistence, live credential flow, or authenticated smoke test.
- Assumptions / Inferences: Mapper-level functions can be implemented and tested before `CopilotAdapter.createSession()` is made runnable; runtime capabilities should remain disabled unless this leaf proves runnable behavior.
- Missing inputs: None. Installed Copilot SDK types were inspected after `npm ci`.

# Target Completion Route

The route is complete. The child execution estimation from `.codex/execution-plans/bel-1257/proposed-files.txt` returned `proceed-with-controls`, medium blast radius, 8 adjusted story points, and no decomposition recommendation. Dependencies were installed, SDK types were inspected, focused Copilot mapping modules were added for provider options, MCP descriptors, permission policy, and validation, capability notes were updated without claiming runtime session support, post-consensus containment fixes added reserved provider `sessionConfig` field shape validation including system-message section override shape and union-mode validation, and focused plus adjacent validation gates passed.

# Execution Steps

| Step | Action | Target | Depends on | Evidence | Stop condition |
| --- | --- | --- | --- | --- | --- |
| 1 | Validate the execution brief and this execution plan, then write checksums. | `.codex/execution-briefs/bel-1257/execution-brief.md`, `.codex/execution-plans/bel-1257/execution-plan.md` | Source inventory loaded | Validator output passes and checksum files exist. | Structural validation fails and cannot be fixed without scope changes. |
| 2 | Run child execution estimation with `--decomposition-depth 1`. | `.codex/execution-plans/bel-1257/proposed-files.txt` | Step 1 | Passed at 2026-06-01T16:23:09Z with `proceed-with-controls`, medium blast radius, 8 adjusted story points, and `decompositionRecommended: false`. | Estimator returns `decompose-first`, `plan-first`, blocks execution, or recommends decomposition. |
| 3 | Install dependencies if absent and inspect Copilot SDK config/permission types. | `npm ci`, `node_modules/@github/copilot-sdk/dist/*.d.ts` | Step 2 | `npm ci` completed; SDK types confirm session config, MCP, and permission handler shapes including deterministic `reject` decisions. | SDK types do not expose a deterministic reject path for permission requests. |
| 4 | Add MCP descriptor mapping. | `src/providers/copilot/mcp-options.ts` | Step 3 | Stdio, http, and sse descriptors map to Copilot session config shape with deterministic merge precedence. | SDK MCP shape conflicts with normalized descriptors. |
| 5 | Add permission policy helpers. | `src/providers/copilot/permissions.ts` | Step 3 | `deny` rejects permission requests; `interactive` fails closed without provider handler; `auto-approve-safe` approves only read-only requests and rejects others. | Safe non-interactive behavior cannot be represented. |
| 6 | Add provider-option and session-config mapping with validation. | `src/providers/copilot/provider-options.ts`, `src/providers/copilot/validation.ts`, `src/providers/copilot/types.ts` | Steps 4 and 5 | Normalized session-owned fields override provider escape hatches; unsupported fields and malformed reserved provider-native fields throw typed `AgentError`. | Provider-specific escape hatch can override normalized ownership silently or malformed reserved fields can reach mapper logic. |
| 7 | Update provider-local exports and capability notes if needed. | `src/providers/copilot/index.ts`, `src/providers/copilot/capabilities.ts` | Step 6 | Provider-local mapping helpers are importable for tests and future adapter code; capabilities do not overclaim runnable sessions. | Capability changes would imply runtime behavior not implemented in this leaf. |
| 8 | Add focused unit tests for session option, MCP, provider option, and permission mapping. | `test/providers/copilot/session-options.test.ts` | Steps 4 through 7 | 8 focused tests pass without live credentials or `session.send()`. | Tests require live Copilot runtime or turn execution. |
| 9 | Run validation gates and update durable artifacts with results. | Commands in Validation Gates | Step 8 | Focused tests, adjacent regressions, typecheck, sequential check, package smoke, and diff hygiene passed. | Required validation fails for a reason outside BEL-1257 scope. |

# File Touch Plan

| Path | Change type | Purpose | Expected churn | Risk notes |
| --- | --- | --- | --- | --- |
| `.codex/execution-briefs/bel-1257/execution-brief.md` | add/update | Durable brief for source-grounded execution and review boundary. | medium | Must validate and checksum after material changes. |
| `.codex/execution-briefs/bel-1257/execution-brief.sha256` | add/update | Brief checksum. | low | Must be regenerated after brief changes. |
| `.codex/execution-plans/bel-1257/execution-plan.md` | add/update | Durable executable route. | medium | Must validate and checksum after material changes. |
| `.codex/execution-plans/bel-1257/execution-plan.sha256` | add/update | Plan checksum. | low | Must be regenerated after plan changes. |
| `.codex/execution-plans/bel-1257/proposed-files.txt` | add | Proposal file list for child estimation. | low | Keep aligned with implementation route before estimation. |
| `src/providers/copilot/mcp-options.ts` | add | Map normalized MCP descriptors to Copilot session config descriptors. | medium | Preserve deterministic precedence and descriptor fields. |
| `src/providers/copilot/permissions.ts` | add | Derive deterministic Copilot permission handlers from normalized approval mode. | medium | Non-interactive modes must not hang. |
| `src/providers/copilot/provider-options.ts` | add | Build Copilot session config from normalized session options and provider-specific escape hatches. | medium | Guard session-owned fields from unsafe overrides. |
| `src/providers/copilot/validation.ts` | add | Fail unsupported or ambiguous Copilot session options with typed `AgentError`. | low | Keep validation local to Copilot session mapping. |
| `src/providers/copilot/types.ts` | update | Add provider-option and mapper-adjacent type aliases if SDK types require them. | low | Avoid leaking provider-specific types through the root surface. |
| `src/providers/copilot/capabilities.ts` | update | Keep capability metadata aligned with mapper support without claiming runnable sessions. | low | Do not overclaim runtime behavior. |
| `src/providers/copilot/index.ts` | update | Export provider-local mapping helpers for tests and future adapter integration. | low | Root package should still avoid provider-specific exports. |
| `test/providers/copilot/session-options.test.ts` | add | Prove option, MCP, provider-option, and permission policy mapping. | medium | Tests must not require live Copilot credentials. |

# Estimation Inputs

| Field | Value | Notes |
| --- | --- | --- |
| `repoRoot` | `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1257` | Target worktree for this leaf. |
| `mode` | `proposal` | Run before code changes. |
| `proposedFiles` | `.codex/execution-plans/bel-1257/proposed-files.txt` | Newline-delimited implementation files, excluding checksum artifacts. |
| `proposalLinesChanged` | `unknown` | Estimator should use heuristic from proposed files. |
| `baseRef` | `n/a` | Proposal mode. |
| `headRef` | `n/a` | Proposal mode. |
| `includeWorkingTree` | `false` | Estimation must run before code implementation. |

# Validation Gates

| Gate | Command or check | Required evidence | Owner |
| --- | --- | --- | --- |
| Brief validation | `npx -y @jasonbelmonti/markdown-engine@2.0.0 validate --file ./.codex/execution-briefs/bel-1257/execution-brief.md --profile /Users/jasonbelmonti/.codex/skills/execution-brief/profiles/execution-brief.yaml` | Markdown profile validation passes. | codex |
| Plan validation wrapper | `python3 /Users/jasonbelmonti/.codex/skills/execution-plan/scripts/validate_execution_plan.py --file ./.codex/execution-plans/bel-1257/execution-plan.md` | Wrapper validation passes before execution. | codex |
| Child execution estimation | `python3 /Users/jasonbelmonti/.codex/skill-checkouts/execution-estimation/scripts/estimate_execution.py --repo-root /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1257 --proposed-files ./.codex/execution-plans/bel-1257/proposed-files.txt --decomposition-depth 1` | Passed at 2026-06-01T16:23:09Z with `proceed-with-controls`, medium blast radius, 8 adjusted story points, `planning.blocksExecution: false`, and `decompositionRecommended: false`. | codex |
| Dependency install | `npm ci` | Dependencies available in the worktree if `node_modules` is absent. | codex |
| SDK type inspection | `rg -n "SessionConfigBase|onPermission|Permission|mcpServers|availableTools|excludedTools" node_modules/@github/copilot-sdk/dist -S` | Completed after `npm ci`; SDK exposes deterministic `reject` permission decisions and confirms session config/MCP fields. | codex |
| Focused tests | `npm test -- test/providers/copilot/session-options.test.ts` | Passed after post-consensus containment fixes: 1 file, 8 tests. | codex |
| Adjacent regression tests | `npm test -- test/providers/copilot/session-options.test.ts test/providers/copilot/readiness.test.ts test/providers/copilot/sdk.test.ts test/providers/copilot/fakes.test.ts test/public-api.test.ts` | Passed after post-consensus containment fixes: 5 files, 34 tests. | codex |
| Type validation | `npm run typecheck` | Passed after post-consensus containment fixes. | codex |
| Baseline validation | `npm run check` | Passed sequentially after generated-output contention was isolated and passed again after the containment fixes. | codex |
| Packed artifact validation | `npm run package:check` | Passed after post-consensus containment fixes. | codex |
| Diff hygiene | `git diff --check` | Passed after post-consensus containment fixes. | codex |

# Stop Conditions

- A named material source becomes unavailable or conflicts with the loaded issue/brief scope.
- Child execution estimation returns `decompose-first`, `plan-first`, blocks execution, or recommends decomposition.
- Copilot SDK types do not expose a deterministic permission rejection path for non-interactive modes.
- The route requires Copilot `session.send()`, event queue, turn result normalization, resume persistence, live credentials, or authenticated smoke tests.
- Provider-specific escape hatches cannot be contained without changing normalized core contracts.
- Capability changes would imply runtime behavior not implemented by BEL-1257.

# Plan Viability Review

| Review area | Viability question | Reviewer notes | Decision | Required revision |
| --- | --- | --- | --- | --- |
| Source authority | Are all material sources loaded or explicitly marked as missing? | Current thread, AGENTS.md, Linear issue and comments, spike brief with verified checksum, BEL-1256 artifacts, BEL-1257 brief, source state, and installed SDK type details are loaded. | pass | None. |
| Route feasibility | Can the route be executed with current access, dependencies, and constraints? | Worktree exists on `origin/main`; required source files are present; dependency install is available; no live credential is required. | pass | None. |
| Dependency order | Are prerequisite inspections, changes, and validations sequenced before dependent work? | Artifact validation and child estimation precede dependency install and code changes; SDK type inspection precedes mapping implementation; tests follow modules. | pass | None. |
| Validation evidence | Can the validation gates prove the intended outcome objectively? | Gates cover artifact structure, estimation, SDK type confirmation, focused unit tests, typecheck, baseline check, and diff hygiene. | pass | None. |
| Estimation readiness | Can execution sizing derive proposal or diff inputs from the plan? | `proposed-files.txt`, File Touch Plan, repo root, proposal mode, and decomposition depth are specified. | pass | None. |
| Execution commitment | Is the plan ready to use as execution context without hidden blockers? | Execution is complete and validation passed; no hidden blocker remains inside BEL-1257 scope. | pass | None. |

# Plan Readiness Check

| Check | Requirement | Evidence | Status |
| --- | --- | --- | --- |
| Placeholder sweep | No unresolved template placeholders remain in the artifact. | Manual sweep completed before validation. | pass |
| Source completeness | Material sources are loaded or listed as missing inputs. | Source Inventory lists controlling sources, and SDK type inspection is complete. | pass |
| Step specificity | Each execution step has an action, target, dependency, evidence, and stop condition. | Execution Steps table is complete. | pass |
| Viability review | Plan viability is reviewed before execution commitment. | Plan Viability Review decisions are all pass. | pass |
| Estimation readiness | File or diff inputs can be passed to an execution sizing workflow. | Estimation Inputs and `proposed-files.txt` are complete. | pass |
| Validation readiness | Required commands or manual checks have evidence expectations. | Validation Gates table is complete. | pass |

# Review Handoff

- Review boundary: Judge option mapping, MCP descriptor mapping, provider-option containment, permission safety, typed failures, and capability honesty for BEL-1257 only.
- Out of scope: Copilot `session.send()`, event queue, result normalization, resume persistence, live credentials, and smoke tests.
- Planned follow-up work: Runtime session execution, event/result mapping, live authenticated smoke coverage, and normalized interactive approvals.
- Evidence to include: Artifact validation/checksums, child execution-estimation JSON summary, SDK type inspection notes, focused test output, typecheck output, baseline validation, and diff hygiene.

# Revision Log

| Timestamp | Actor | Change | Artifact checksum reference |
| --- | --- | --- | --- |
| 2026-06-01T16:17:31Z | codex | Created initial Execution Plan for BEL-1257. | pending; write `execution-plan.sha256` after validation |
| 2026-06-01T16:23:09Z | codex | Recorded passed artifact validation/checksum creation and child execution estimation gate. | pending; write `execution-plan.sha256` after validation |
| 2026-06-01T16:33:04Z | codex | Recorded completed implementation, SDK type evidence, and passing validation gates. | pending; write `execution-plan.sha256` after validation |
| 2026-06-01T16:50:35Z | codex | Recorded post-consensus reserved provider `sessionConfig` shape validation fix and rerun validation gates. | pending; write `execution-plan.sha256` after validation |
| 2026-06-01T16:58:59Z | codex | Recorded post-consensus `systemMessage.sections` override validation fix and rerun validation gates. | pending; write `execution-plan.sha256` after validation |
| 2026-06-01T17:07:47Z | codex | Recorded post-consensus `systemMessage.sections` customize-mode validation fix and rerun validation gates. | pending; write `execution-plan.sha256` after validation |
