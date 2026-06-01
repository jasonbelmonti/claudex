---
title: "BEL-1256 Execution Plan"
plan_id: "bel-1256"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-05-31T16:53:06Z"
updated_at: "2026-06-01T14:52:43Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1256"
target_branch: "codex/bel-1256-copilot-readiness"
source_packet: ".codex/execution-briefs/bel-1256/execution-brief.md"
estimation_mode: "proposal"
validation_profile: "/Users/jasonbelmonti/.codex/skills/execution-plan/profiles/execution-plan.yaml"
---

# Objective

Implement BEL-1256 by adding Copilot capability metadata and SDK lifecycle readiness reporting, using the existing CLX-COP-2 facade and fakes, without implementing Copilot session creation, turns, resume, or event normalization.

# Source Inventory

| Source | Retrieved at | Authority | Status | Plan impact |
| --- | --- | --- | --- | --- |
| Current thread | 2026-05-31T16:53:06Z | Latest user intent and sequencing | loaded | Requires execution brief, execution plan, then execution. |
| `AGENTS.md` | 2026-05-31T16:51:03Z | Repo-local operating rules | loaded | Requires worktree use, Node/npm workflows, Vitest, small modules, and execution estimation. |
| Linear issue BEL-1256 | 2026-05-31T16:51:03Z | Task objective, scope, and review boundary | loaded | Defines readiness/capabilities scope, non-goals, validation gates, and child estimation requirement. |
| `.worktrees/copilot-sdk-spike/.codex/execution-briefs/copilot-sdk-spike/execution-brief.md` | 2026-05-31T16:51:03Z | SDK behavior evidence | loaded and checksum verified | Controls SDK lifecycle, auth mapping, runtime version, and capability honesty. |
| `.codex/execution-briefs/bel-1256/execution-brief.md` | 2026-05-31T16:53:06Z | Durable execution snapshot | loaded | Controls execution scope, stop conditions, and review boundary for this route. |
| Worktree source state at `bf5170c` | 2026-05-31T16:53:06Z | Current implementation state | loaded | Confirms facade/fakes exist and identifies missing readiness/capability/adapter files. |

# Planning Constraints

- Confirmed constraints: Run child execution estimation with `--decomposition-depth 1` before coding; use Node/npm workflows; keep React guidance irrelevant because this task has no frontend; use focused modules.
- Dependencies: CLX-COP-2 facade/fakes exist; `@github/copilot-sdk@1.0.0-beta.9` is installed by `package.json`; `node_modules` must be installed in the new worktree before npm validation.
- Non-goals: No Copilot sessions, turns, resume behavior, event normalization, or live authenticated smoke tests.
- Assumptions / Inferences: A minimal `CopilotAdapter` is needed so default provider loading can expose readiness and capabilities; session methods should throw normalized `unsupported_feature` errors.
- Missing inputs: None currently identified.

# Target Completion Route

First, validate this plan and run child execution estimation from the proposed file list. The estimator returned `proceed-with-controls`, medium blast radius, 8 adjusted story points, and `decompositionRecommended: false`, so execution may proceed with targeted automated tests and shared-surface review controls. Add focused Copilot capability, readiness, and adapter modules that use the existing SDK facade and fake client. Then wire the default adapter loader, extend provider-local exports, add focused fake-backed tests, install dependencies if missing, and run targeted tests plus type validation.

# Execution Steps

| Step | Action | Target | Depends on | Evidence | Stop condition |
| --- | --- | --- | --- | --- | --- |
| 1 | Validate the execution brief and this execution plan, then write checksums. | `.codex/execution-briefs/bel-1256/execution-brief.md`, `.codex/execution-plans/bel-1256/execution-plan.md` | Source inventory loaded | Validator output passes and checksum files exist. | Structural validation fails and cannot be fixed without scope changes. |
| 2 | Run child execution estimation with `--decomposition-depth 1`. | `.codex/execution-plans/bel-1256/proposed-files.txt` | Step 1 | Estimator returned `proceed-with-controls`, medium blast radius, 8 adjusted story points, and `decompositionRecommended: false`. | Estimator returns `decompose-first`, `plan-first`, or decomposition required. |
| 3 | Add honest Copilot capability metadata. | `src/providers/copilot/capabilities.ts` | Step 2 | Capability object reports `provider: "copilot"` and only proven features as available. | Required capability claims depend on session/live behavior. |
| 4 | Add SDK lifecycle readiness probe with ownership cleanup. | `src/providers/copilot/readiness.ts`, `src/providers/copilot/types.ts` if needed | Step 3 | Probe starts client, reads status/auth, maps unauthenticated to `needs_auth`, stops only owned clients, and records stop warnings. | Ownership cannot be represented without changing public contracts. |
| 5 | Add minimal default Copilot adapter and loader wiring. | `src/providers/copilot/adapter.ts`, `src/providers/copilot/index.ts`, `src/provider-adapter-loaders.ts` | Step 4 | Default loader can construct `CopilotAdapter`; adapter exposes readiness/capabilities and rejects session methods as unsupported. | Loader wiring would force session implementation. |
| 6 | Add focused tests for readiness, cleanup, capability honesty, and loader/export behavior. | `test/providers/copilot/readiness.test.ts`, `test/providers/copilot/sdk.test.ts`, `test/providers/copilot/fake-client.ts` | Step 5 | Tests cover ready, needs-auth, startup/status/auth failure, stop warning, owned cleanup, injected client non-cleanup, and default export surface. | Tests require live Copilot credentials or sessions. |
| 7 | Install dependencies if absent, then run validation gates. | `npm ci`, `npm test -- test/providers/copilot/readiness.test.ts test/providers/copilot/sdk.test.ts`, `npm run typecheck` | Step 6 | Commands pass or failures are documented with exact scope. | Required validation fails for reasons outside BEL-1256 scope. |

# File Touch Plan

| Path | Change type | Purpose | Expected churn | Risk notes |
| --- | --- | --- | --- | --- |
| `.codex/execution-briefs/bel-1256/execution-brief.md` | add/update | Durable brief for source-grounded execution and review boundary. | medium | Must validate and checksum. |
| `.codex/execution-briefs/bel-1256/execution-brief.sha256` | add/update | Brief checksum. | low | Must be regenerated after brief changes. |
| `.codex/execution-plans/bel-1256/execution-plan.md` | add/update | Durable executable route. | medium | Must validate and checksum. |
| `.codex/execution-plans/bel-1256/execution-plan.sha256` | add/update | Plan checksum. | low | Must be regenerated after plan changes. |
| `.codex/execution-plans/bel-1256/proposed-files.txt` | add | Proposal file list for child estimation. | low | Keep aligned with code route before estimation. |
| `src/providers/copilot/capabilities.ts` | add | Define honest Copilot capability metadata. | medium | Do not overclaim session resume, image, cost, or reasoning support. |
| `src/providers/copilot/readiness.ts` | add | Implement SDK startup/status/auth/cleanup readiness probe. | medium | Must not stop caller-supplied shared clients by default. |
| `src/providers/copilot/adapter.ts` | add | Provide default adapter for readiness/capabilities only. | low | Session methods must fail predictably as out of scope. |
| `src/providers/copilot/index.ts` | update | Export provider-local capability/readiness/adapter surface. | low | Root package should still avoid provider-specific exports. |
| `src/provider-adapter-loaders.ts` | update | Wire default Copilot adapter loader. | low | Preserve custom adapter override behavior. |
| `scripts/dist-package.config.ts` | update | Emit packaged Copilot adapter JS and externalize the SDK dependency. | low | Required so default Copilot loading works from `dist/index.js`. |
| `test/providers/copilot/readiness.test.ts` | add | Prove readiness status mapping, cleanup ownership, and capability metadata. | medium | Use fakes only; no live credentials. |
| `test/providers/copilot/sdk.test.ts` | update | Prove provider-local adapter export without root export. | low | Avoid broad public API changes. |
| `test/providers/copilot/fake-client.ts` | update | Support failure injection for lifecycle/readiness tests. | low | Keep fake deterministic. |

# Estimation Inputs

| Field | Value | Notes |
| --- | --- | --- |
| `repoRoot` | `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1256` | Target worktree for this leaf. |
| `mode` | `proposal` | Run before code changes. |
| `proposedFiles` | `.codex/execution-plans/bel-1256/proposed-files.txt` | Newline-delimited implementation files, excluding checksum artifacts. |
| `proposalLinesChanged` | `unknown` | Estimator should use heuristic from proposed files. |
| `baseRef` | `n/a` | Proposal mode. |
| `headRef` | `n/a` | Proposal mode. |
| `includeWorkingTree` | `false` | Estimation must run before code implementation. |

# Validation Gates

| Gate | Command or check | Required evidence | Owner |
| --- | --- | --- | --- |
| Brief validation | `npx -y @jasonbelmonti/markdown-engine@2.0.0 validate --file ./.codex/execution-briefs/bel-1256/execution-brief.md --profile /Users/jasonbelmonti/.codex/skills/execution-brief/profiles/execution-brief.yaml` | Markdown profile validation passes. | codex |
| Plan validation wrapper | `python3 /Users/jasonbelmonti/.codex/skills/execution-plan/scripts/validate_execution_plan.py --file ./.codex/execution-plans/bel-1256/execution-plan.md` | Wrapper validation passes before execution. | codex |
| Child execution estimation | `python3 /Users/jasonbelmonti/.codex/skill-checkouts/execution-estimation/scripts/estimate_execution.py --repo-root /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1256 --proposed-files ./.codex/execution-plans/bel-1256/proposed-files.txt --decomposition-depth 1` | Passed at 2026-05-31T16:55:53Z with `proceed-with-controls`, medium blast radius, 8 adjusted story points, and no decomposition recommendation. | codex |
| Dependency install | `npm ci` | Dependencies available in the worktree if `node_modules` is absent. | codex |
| Focused tests | `npm test -- test/providers/copilot/readiness.test.ts test/providers/copilot/sdk.test.ts test/providers/copilot/fakes.test.ts` | Passed after final refinement: 3 files, 16 tests. | codex |
| Shared regression tests | `npm test -- test/providers/claudex/adapter.test.ts test/public-api.test.ts test/contract/readiness.test.ts test/providers/adapter-entry-loader.test.ts` | Passed: 4 files, 21 tests. | codex |
| Type validation | `npm run typecheck` | Passed. | codex |
| Baseline validation | `npm run check` | Passed lint, typecheck, dist build, and declaration build. | codex |
| Packed artifact validation | `npm run package:check` | Passed packed artifact smoke. | codex |
| Dist loader smoke | `node --input-type=module` using `./dist/index.js` with `preferredProviders: ["copilot"]` | Passed: returned `{"provider":"copilot","status":"ready","providerVersion":"dist-smoke-runtime","stopCallCount":1}`. | codex |
| Diff hygiene | `git diff --check` | Passed. | codex |
| Consensus review | Three independent reviewer agents using packet SHA-256 `261790d859fe90d3837235a8a56b441583ab9e4304bc7c860f0026cc4a6bf77e` | Passed: 3/3 `APPROVE`, no findings. | codex |

# Stop Conditions

- A named material source becomes unavailable or conflicts with the loaded issue/brief scope.
- Child execution estimation returns `decompose-first`, `plan-first`, blocks execution, or recommends decomposition.
- The route requires session creation, turn execution, event normalization, live Copilot credentials, or authenticated smoke tests.
- Ownership rules cannot prevent stopping a caller-supplied shared client by default.
- Required validation fails for a reason outside BEL-1256 and cannot be isolated.

# Plan Viability Review

| Review area | Viability question | Reviewer notes | Decision | Required revision |
| --- | --- | --- | --- | --- |
| Source authority | Are all material sources loaded or explicitly marked as missing? | Current thread, AGENTS.md, Linear issue, spike brief with verified checksum, execution brief, and source state are loaded. | pass | None. |
| Route feasibility | Can the route be executed with current access, dependencies, and constraints? | Worktree exists, CLX-COP-2 facade/fakes exist, and no live credential is required. Dependency install may be required before npm gates. | pass | None. |
| Dependency order | Are prerequisite inspections, changes, and validations sequenced before dependent work? | Validation and child estimation precede code changes; capabilities precede readiness and adapter wiring; tests follow implementation. | pass | None. |
| Validation evidence | Can the validation gates prove the intended outcome objectively? | Gates cover artifact structure, estimation, fake-backed readiness behavior, export/loader surface, and TypeScript. | pass | None. |
| Estimation readiness | Can execution sizing derive proposal or diff inputs from the plan? | `proposed-files.txt` and File Touch Plan provide proposal-mode inputs with repo root and depth specified. | pass | None. |
| Execution commitment | Is the plan ready to use as execution context without hidden blockers? | Ready after validation and child estimation pass; stop conditions cover decomposition, session scope creep, and ownership blockers. | pass | None. |

# Plan Readiness Check

| Check | Requirement | Evidence | Status |
| --- | --- | --- | --- |
| Placeholder sweep | No unresolved template placeholders remain in the artifact. | Manual sweep completed before validation. | pass |
| Source completeness | Material sources are loaded or listed as missing inputs. | Source Inventory lists current thread, AGENTS.md, BEL-1256, spike brief, execution brief, and worktree state. | pass |
| Step specificity | Each execution step has an action, target, dependency, evidence, and stop condition. | Execution Steps table is complete. | pass |
| Viability review | Plan viability is reviewed before execution commitment. | Plan Viability Review decisions are all pass. | pass |
| Estimation readiness | File or diff inputs can be passed to an execution sizing workflow. | Estimation Inputs and `proposed-files.txt` are complete. | pass |
| Validation readiness | Required commands or manual checks have evidence expectations. | Validation Gates table is complete. | pass |

# Review Handoff

- Review boundary: Judge readiness correctness, cleanup ownership, capability honesty, and default adapter exposure for BEL-1256 only.
- Out of scope: Copilot sessions, resume, turn execution, event normalization, live credentials, and smoke tests.
- Planned follow-up work: Session/turn/event implementation and authenticated smoke coverage.
- Evidence to include: Artifact validation/checksums, child execution-estimation JSON summary, focused test output, and typecheck output.

# Revision Log

| Timestamp | Actor | Change | Artifact checksum reference |
| --- | --- | --- | --- |
| 2026-05-31T16:53:06Z | codex | Created initial Execution Plan for BEL-1256. | see `execution-plan.sha256` |
| 2026-05-31T16:55:53Z | codex | Recorded passed child execution estimation gate and marked plan ready for implementation. | see `execution-plan.sha256` |
| 2026-05-31T17:02:27Z | codex | Recorded completed implementation route, package build touch, and validation evidence. | see `execution-plan.sha256` |
| 2026-06-01T14:52:43Z | codex | Recorded final refinement validation and clean consensus review. | see `execution-plan.sha256` |
