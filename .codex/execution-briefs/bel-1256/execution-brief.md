---
title: "BEL-1256 Copilot Readiness and Capability Reporting"
brief_id: "bel-1256"
artifact_version: "1.0.0"
status: "ready-for-review"
created_at: "2026-05-31T16:53:06Z"
updated_at: "2026-06-01T15:34:39Z"
target_repo: "/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1256"
target_branch: "codex/bel-1256-copilot-readiness"
review_boundary_id: "RB-bel-1256"
---

# Objective

Implement normalized GitHub Copilot readiness and capability reporting for BEL-1256 using the SDK runtime startup, status, auth, and cleanup lifecycle, without creating Copilot sessions or running Copilot turns.

# Context / Constraints

- Confirmed constraints:
  - Current user instruction on 2026-05-31 requests `$execution-brief` for BEL-1256, then `$execution-plan`, then execution.
  - Work must run in the repo-local worktree `/Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1256` on branch `codex/bel-1256-copilot-readiness`.
  - Repo instructions require Node and npm workflows, Vitest, focused modules, and execution estimation before new work.
  - BEL-1256 requires child execution estimation with `--decomposition-depth 1` before coding.
  - The package is ESM-only, targets Node `>=20`, and depends on `@github/copilot-sdk@1.0.0-beta.9`.
  - CLX-COP-2 facade and fakes exist on `origin/main` at `bf5170c`.
- Dependencies:
  - Linear issue BEL-1256 controls the task scope and success criteria.
  - Copilot SDK spike brief checksum verified as `36ffddb6de786eb4a51296d5fee2675a2050abd6491bbfe9d98f7ac04f27b872`.
  - Existing readiness and capability contracts in `src/core/readiness.ts` and `src/core/capabilities.ts`.
  - Existing provider readiness patterns in `src/providers/codex/readiness.ts` and `src/providers/claude/readiness.ts`.
- Non-goals:
  - Do not implement Copilot session creation, turn execution, event normalization, resume behavior, or live authenticated smoke coverage.
  - Do not claim unsupported Copilot capabilities such as resume, image input, cost, or reasoning support without proof.
- Accepted tradeoffs:
  - A default Copilot adapter may expose readiness and capabilities while session methods throw normalized unsupported-feature errors until later leaves implement sessions.
- Assumptions / Inferences:
  - Because `src/provider-adapter-loaders.ts` currently marks Copilot default loading as unavailable, BEL-1256 likely needs a minimal provider-local `CopilotAdapter` wired into default loading so consumers can call readiness/capabilities without supplying a custom adapter.

# Authoritative Sources

| Source | Retrieved at | Authority | Status | Controls |
| --- | --- | --- | --- | --- |
| Current thread | 2026-05-31T16:53:06Z | Latest user intent and sequencing | loaded | Execute BEL-1256 through execution brief, execution plan, then implementation. |
| `/Users/jasonbelmonti/Documents/Development/claudex/AGENTS.md` | 2026-05-31T16:51:03Z | Repo-local operating rules | loaded | Use worktrees, Node/npm workflows, Vitest, small modules, and pre-work estimation. |
| Linear issue BEL-1256 | 2026-05-31T16:51:03Z | Task record and review boundary | loaded | Defines objective, in-scope readiness/capabilities, non-goals, success criteria, and validation gates. |
| Copilot SDK spike brief | 2026-05-31T16:51:03Z | SDK runtime evidence | loaded and checksum verified | Controls SDK startup/status/auth/cleanup behavior and capability honesty. |
| Worktree source state at `bf5170c` | 2026-05-31T16:53:06Z | Current implementation state | loaded | Confirms CLX-COP-2 facade/fakes exist and shows current provider patterns. |

# Current State

- Planning / PM:
  - BEL-1256 is Linear status `Todo`, priority `High`, estimate `5 Points`, project `claudex: GitHub Copilot SDK Support`.
  - Required child execution estimation ran at 2026-05-31T16:55:53Z and returned `proceed-with-controls`, medium blast radius, 8 adjusted story points, and `decompositionRecommended: false`.
- Design:
  - `ProviderReadiness` supports `ready`, `missing_cli`, `needs_auth`, `degraded`, and `error`.
  - `ProviderCapabilities` reports feature availability by catalog id with optional raw/extensions metadata.
  - Spike evidence says unauthenticated Copilot SDK auth status maps to `needs_auth`, not `missing_cli`.
- Implementation:
  - Copilot provider id, facade types, `createCopilotClient`, dependency, and test fakes already exist.
  - Added `src/providers/copilot/capabilities.ts`, `src/providers/copilot/readiness.ts`, and `src/providers/copilot/adapter.ts`.
  - `src/provider-adapter-loaders.ts` now loads the default `CopilotAdapter` when no custom Copilot adapter is supplied.
  - `scripts/dist-package.config.ts` now emits `dist/providers/copilot/adapter.js` and keeps `@github/copilot-sdk` external.
  - Copilot readiness now bounds SDK startup, status, auth, cleanup, and force-stop lifecycle operations with a referenced `readinessTimeoutMs` watchdog; timeout and client-construction failures return normalized readiness diagnostics.
  - `npm ci` installed worktree dependencies; npm reported existing audit findings outside BEL-1256 scope.
- Validation:
  - Spike brief checksum matches the BEL-1256 expected digest.
  - Execution brief and execution plan structural validation passed before implementation.
  - Child execution estimation permits implementation with targeted automated tests and downstream shared-surface review controls.
  - Focused Copilot tests passed after lifecycle timeout hardening: 3 files, 22 tests.
  - Shared regressions, `npm run typecheck`, `npm run check`, `npm run package:check`, a dist-level Copilot loader smoke, and `git diff --check` passed after lifecycle timeout hardening.
  - Consensus review ran with three independent reviewers against packet SHA-256 `261790d859fe90d3837235a8a56b441583ab9e4304bc7c860f0026cc4a6bf77e`; all three returned `APPROVE` with no findings.
  - A second consensus pass against packet SHA-256 `268750217e5a464ffd11b49a3c0cd8b6f6ff4515178a894d0d8c4d3e1d5ef792` returned `REJECT` for unnormalized client-factory failures and unbounded cleanup; both findings were fixed.
  - A third consensus pass against packet SHA-256 `f36461c335c5a7cf423a3e4f663b414808c90cdadd2be9ca4cd7230e8f6c5f3d` returned `REJECT` for unbounded startup/status/auth awaits; the lifecycle timeout fix has been applied and validated locally.
  - A fourth consensus pass against packet SHA-256 `98d08f4b8528dc2a75e6a1c05c017696939f833aee57537f2cd56aadcfe3d7f1` returned `REJECT` because the readiness timeout watchdog used `unref()`; the watchdog now remains referenced and validation passed again.
  - Final consensus review ran with three independent reviewers against packet SHA-256 `c51ec37bcd79ca0c611e4191af118e891fde38a76b84bc54b009541f968c6684`; all three returned `APPROVE` with no findings.
- Known gaps:
  - Session behavior is intentionally absent for this leaf.
  - Cleanup errors and lifecycle timeouts now degrade otherwise-ready readiness or return normalized error readiness according to the failed lifecycle phase.
  - Live authenticated Copilot behavior remains out of scope.

# Execution Scope

| Scope item | Classification | Approval impact | Notes |
| --- | --- | --- | --- |
| Copilot capability metadata | in-scope | blocking | Add honest capability reporting with provider/runtime details when available. |
| SDK-based readiness probe | in-scope | blocking | Use `start()`, `getStatus()`, `getAuthStatus()`, and bounded owned-client cleanup. |
| Failure and cleanup paths | in-scope | blocking | Client construction, startup/status/auth/stop/force-stop failures and timeouts must normalize predictably with safe raw diagnostics. |
| Copilot default adapter for readiness/capabilities | in-scope | blocking | Expose provider-local adapter behavior without implementing sessions. |
| Session creation, resume, turns, and event normalization | out-of-scope | non-blocking | Later leaves own this work. |
| Live authenticated smoke coverage | out-of-scope | non-blocking | Deferred until sessions exist. |

# Materially Verifiable Success Criteria

- [x] `checkReadiness()` returns `ready` when Copilot runtime status and auth pass.
- [x] `checkReadiness()` returns `needs_auth` when `getAuthStatus().isAuthenticated === false`.
- [x] Startup/status/auth/client-construction/cleanup errors and lifecycle timeouts produce normalized `error` or degraded checks with raw diagnostics preserved where safe.
- [x] Capabilities include known supported/unsupported features without overclaiming resume, image, cost, or reasoning support.
- [x] Readiness tests prove owned clients are cleaned up and injected clients are handled according to the ownership contract.
- [x] Child execution estimation with `--decomposition-depth 1` is captured before code changes.

# Review Boundary

| Boundary | Scope | Approval impact | Notes |
| --- | --- | --- | --- |
| Readiness correctness | in-scope | blocking | Reject if readiness can leak owned runtime processes, hang, or misclassify unauthenticated SDK state. |
| Capability honesty | in-scope | blocking | Reject if unsupported Copilot behavior is reported available. |
| Default adapter surface | in-scope | blocking | Reject if Copilot cannot expose readiness/capabilities through normal provider loading. |
| Session behavior | out-of-scope | non-blocking | Do not require turn execution, session resume, or event mapping unless current diff claims support. |

# Planned Follow-up Work

- Implement Copilot session creation, resume, turn execution, and event normalization in later leaves.
- Add opt-in live authenticated Copilot smoke coverage after session support exists.
- Revisit image, reasoning, resume, and cost support only after live or contract evidence exists.

# Execution Plan

1. Create and validate `.codex/execution-plans/bel-1256/execution-plan.md`.
2. Run child execution estimation with `--decomposition-depth 1` from the plan file touch list; stop if decomposition is required.
3. Implement Copilot capabilities, readiness helpers, and minimal adapter wiring.
4. Add focused Copilot readiness/capability tests using injected fakes.
5. Run focused tests and type validation, then update this brief with material validation results.

# Validation Gates

- Validate this brief:
  `npx -y @jasonbelmonti/markdown-engine@2.0.0 validate --file ./.codex/execution-briefs/bel-1256/execution-brief.md --profile /Users/jasonbelmonti/.codex/skills/execution-brief/profiles/execution-brief.yaml`
- Run child execution estimation before coding:
  `python3 /Users/jasonbelmonti/.codex/skill-checkouts/execution-estimation/scripts/estimate_execution.py --repo-root /Users/jasonbelmonti/Documents/Development/claudex/.worktrees/bel-1256 --proposed-files ./.codex/execution-plans/bel-1256/proposed-files.txt --decomposition-depth 1`
- Focused tests:
  `npm test -- test/providers/copilot/readiness.test.ts test/providers/copilot/sdk.test.ts`
- Type validation:
  `npm run typecheck`
- Baseline validation:
  `npm run check`
- Packed artifact validation:
  `npm run package:check`
- Dist loader smoke:
  `node --input-type=module` against `./dist/index.js` with `preferredProviders: ["copilot"]`

# Stop Conditions

- Stop before coding if child estimation returns `decompose-first`, `plan-first`, or `estimation.decompositionRecommended: true`.
- Stop if the Copilot SDK lifecycle ownership contract cannot distinguish owned clients from caller-supplied clients.
- Stop if source behavior requires session creation or turn execution to prove readiness.
- Stop if required validation fails for reasons outside BEL-1256 scope.
- Stop before destructive git operations or credentialed live Copilot access.

# Review Packet Inputs

| Field | Source section | Required mapping | Notes |
| --- | --- | --- | --- |
| `objective` | Objective | Copy BEL-1256 objective. | Focus on readiness and capability reporting only. |
| `intended_behavior_change` | Objective and Execution Plan | Copilot exposes readiness and capabilities through SDK lifecycle probes. | No session or turn support. |
| `in_scope` | Execution Scope | Include in-scope rows. | Blocking review items. |
| `out_of_scope` | Execution Scope and Planned Follow-up Work | Include session/live smoke rows. | Non-blocking unless current diff claims support. |
| `constraints` | Context / Constraints | Include worktree, Node/npm, estimation, SDK lifecycle, and ownership constraints. | Preserve source authority. |
| `review_boundary` | Review Boundary | Copy approval boundaries. | Prevent session/event scope creep. |
| `planned_follow_up_work` | Planned Follow-up Work | Copy deferred items. | Non-blocking. |
| `test_or_risk_context` | Validation Gates and Current State | Include estimation, focused tests, typecheck, and known gaps. | Record skipped gates plainly. |

# Revision Log

| Timestamp | Actor | Change | Checksum |
| --- | --- | --- | --- |
| 2026-05-31T16:53:06Z | codex | Created initial Execution Brief for BEL-1256 from Linear issue, repo instructions, spike evidence, and worktree state. | see `execution-brief.sha256` |
| 2026-05-31T16:55:53Z | codex | Recorded structural validation and child execution estimation gate as cleared for implementation. | see `execution-brief.sha256` |
| 2026-05-31T17:02:27Z | codex | Recorded implemented Copilot readiness/capabilities, package build wiring, and passing validation evidence. | see `execution-brief.sha256` |
| 2026-06-01T14:52:43Z | codex | Recorded final refinement validation and clean three-reviewer consensus approval. | see `execution-brief.sha256` |
| 2026-06-01T15:18:35Z | codex | Recorded second and third consensus rejects, client-construction/cleanup/startup/status/auth timeout hardening, and passing local validation evidence. | see `execution-brief.sha256` |
| 2026-06-01T15:27:16Z | codex | Recorded fourth consensus reject, referenced readiness watchdog correction, and passing local validation evidence. | see `execution-brief.sha256` |
| 2026-06-01T15:34:39Z | codex | Recorded final clean three-reviewer consensus approval after watchdog correction. | see `execution-brief.sha256` |
