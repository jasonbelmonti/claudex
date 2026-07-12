---
title: Claudex Codex Terminal Diagnostics and Empty-Response Hardening
brief_id: claudex-codex-terminal-diagnostics
artifact_version: 1.0.0
status: completed
created_at: 2026-07-12T09:12:09-05:00
updated_at: 2026-07-12T13:23:59-05:00
target_repo: /Users/jasonbelmonti/Documents/Development/claudex
target_branch: codex/claudex-codex-terminal-diagnostics-brief
review_boundary_id: claudex-codex-terminal-diagnostics
---

# Objective

Make Claudex fail deterministically when a Codex turn ends without a usable assistant response or terminal SDK event. Preserve `provider_failure`, expose allowlisted failure kind/session details, retain `raw` behavior, and prevent buffered or streamed callers from accepting empty completion.

# Context / Constraints

- Paid dogfood on Claudex `4.0.0` and Codex `0.142.5` passed readiness/auth, but session `019f5699-48dc-77b2-aba7-e54db8bff5b0` ended without output.
- The upstream CLI/SDK/model/service trigger is unknown because the consumer retained only generic `provider_execution_failed`; do not claim this change repairs upstream behavior.
- Claudex already synthesizes `turn.failed` for a stream lacking a terminal event, but its thrown error lacks stable failure kind/session details.
- Codex turn state starts response text at `""`, so `turn.completed` without a nonblank completed `agent_message` can appear successful.
- Preserve `AgentErrorCode`; use documented `AgentError.details.failureKind` and `sessionId` rather than cross-provider codes.
- Safe details exclude prompts, stderr, auth, configuration, and unrestricted payloads. Preserve `raw`/`cause` for deliberate drill-down.
- Follow `AGENTS.md`: Node/npm/Vitest, ESM, focused modules. No live or paid provider use is authorized.
- The operator authorized `4.0.0` to `4.0.1` in PR #82; precedent limits this to `package.json` and root lockfile versions.

# Authoritative Sources

| Source | Retrieved at | Authority | Status | Controls |
| --- | --- | --- | --- | --- |
| Current user instruction | 2026-07-12T09:12:09-05:00 | Operator intent | loaded | Durable Claudex implementation handoff. |
| Current user version-bump instruction | 2026-07-12T13:21:28-05:00 | Operator intent; newest | loaded | Add patch version `4.0.1` to the existing PR diff before merge. |
| `AGENTS.md`; `main` `0a59254e17eda9a019a5b9bf93168f32c996f2c0` | 2026-07-12T09:04:00-05:00 | Policy/baseline | loaded; clean; current | Node workflow and exact implementation base. |
| `README.md`; `docs/{consumer-guide,capability-matrix}.md` | 2026-07-12T09:08:00-05:00 | Public contract | loaded | Terminal/message and raw-diagnostic guarantees. |
| `src/core/errors.ts`; `src/providers/codex/{errors,events,results,session,state}.ts` | 2026-07-12T09:08:00-05:00 | Runtime contract | loaded | Error, terminal, result, and state behavior. |
| `test/providers/codex/{events,session}.test.ts`; `fakes.ts` | 2026-07-12T09:08:00-05:00 | Test authority | loaded | Existing success/failure coverage. |
| [Provider summary](/Users/jasonbelmonti/Documents/Development/progressive-elaboration-r0/.worktrees/progressive-elaboration-r1-slice-5-dogfood/docs/evidence/artifacts/slice-5-slim-dogfood/provider-session-summary.json) `aa03919e…`; [attempt](/Users/jasonbelmonti/Documents/Development/progressive-elaboration-r0/.worktrees/progressive-elaboration-r1-slice-5-dogfood/docs/evidence/artifacts/slice-5-slim-dogfood/attempt-000001.json) `ac9ee352…`; [report](/Users/jasonbelmonti/Documents/Development/progressive-elaboration-r0/.worktrees/progressive-elaboration-r1-slice-5-dogfood/docs/evidence/slice-5-slim-real-work-dogfood.md) `c0fce6e7…` | 2026-07-12T08:55:26-05:00 | Live/gate evidence | loaded; `DG-REWORK` | No-output session and generic consumer failure. |
| Exact upstream empty-completion cause | 2026-07-12T09:12:09-05:00 | Provider evidence | unavailable | Make recurrence diagnosable; do not speculate. |

# Execution Scope

| Scope item | Classification | Approval impact | Notes |
| --- | --- | --- | --- |
| Terminal failure kinds | in scope | blocking | Distinguish missing terminal from completed-without-message. |
| Empty/blank response rejection | in scope | blocking | Success requires a nonblank completed `agent_message`. |
| Buffered/streamed session identity | in scope | blocking | Safe details retain minted session ID when available. |
| Safe diagnostics | in scope | blocking | Stable details are allowlisted; `raw`/`cause` remain drill-down only. |
| Focused tests and contract docs | in scope | blocking | Cover new failures and successful regressions. |
| Patch version metadata | in scope | blocking | Update package and lockfile root versions from `4.0.0` to `4.0.1`; no dependency changes. |
| Progressive Elaboration fixes | out of scope | non-blocking | Consumer mapping and staged-diff validation need separate briefs. |
| SDK/CLI/upstream repair | out of scope | non-blocking | No dependency or provider change. |
| Live smoke, paid retry, tag/release/publish/merge | out of scope | non-blocking | Version metadata and PR branch push are authorized; release execution remains separate. |
| Claude, Copilot, ingest redesign | out of scope | non-blocking | Prevent regressions; do not expand behavior. |

# Current State

- Focused terminal failure construction now distinguishes empty completion from missing terminal while retaining safe session details.
- Streamed/buffered tests cover rejection, exact response bytes, safe details, terminal uniqueness, and session identity; contract docs are updated.
- Package and lockfile root versions now report `4.0.1`; amended local validation passes. Commit, push, and PR update remain authorized.

# Materially Verifiable Success Criteria

- [x] `CD-SC-1`: `turn.completed` without a completed nonblank `agent_message` yields one terminal `turn.failed`; `session.run()` rejects.
- [x] `CD-SC-2`: Missing and whitespace-only messages preserve `provider_failure` and expose safe `details.failureKind = completed_without_agent_message` plus minted `sessionId`.
- [x] `CD-SC-3`: Stream end without a provider terminal event remains failed and exposes distinct `failureKind = stream_ended_without_terminal` plus session identity.
- [x] `CD-SC-4`: Stable message/details exclude prompts, stderr, auth, config, and unrestricted payloads; existing `raw`/`cause` behavior remains.
- [x] `CD-SC-5`: Successful turns retain exact response bytes, message-before-terminal order, usage/session data, resume, and structured-output behavior.
- [x] `CD-SC-6`: Failure construction is focused rather than duplicated across events/session code; deterministic tests cover both new failures and regressions.
- [x] `CD-SC-7`: Consumer guide/matrix document the strengthened terminal contract and safe-details inspection.
- [x] `CD-SC-8`: Focused tests, `npm run check`, `npm test`, and `npm run package:check` pass without live flags; package metadata reports `4.0.1` with no dependency changes.

# Execution Plan

1. Verify the brief/checksum, base ancestry, and named Codex files/tests.
2. Establish the focused-test baseline.
3. Centralize stable terminal failure construction.
4. Reject missing/blank completion and distinguish missing terminal without changing valid bytes.
5. Preserve buffered, raw/cause, structured-output, usage, success, and resume behavior.
6. Add focused tests and contract docs.
7. Run all local validation and scope checks.
8. Seal the completed brief and checksum.
9. Apply `4.0.1` package/lockfile metadata, revalidate, update PR #82, commit, and push without release execution.

# Validation Gates

- Brief checksum and markdown-engine Execution Brief profile pass before/after material revisions.
- `npm run test -- test/providers/codex/events.test.ts test/providers/codex/session.test.ts` proves terminal order, safe details, identity, and buffered rejection.
- Existing success, structured-output, SDK-throw, missing-terminal, and resume cases remain passing.
- `npm run check`, `npm test`, and `npm run package:check` exit zero.
- `git diff --check` passes; version changes are limited to `4.0.1` package metadata, with no dependency/release, PE, Claude, Copilot, or ingest changes.
- No live smoke, provider billing, tag, publish, release, or merge command runs; only the authorized PR branch push is permitted.

# Validation Results

| Gate | Result | Evidence |
| --- | --- | --- |
| Brief checksum before execution | pass | `shasum -a 256 -c` reported `execution-brief.md: OK`. |
| Focused Codex tests | pass | 22 tests passed across `events.test.ts` and `session.test.ts`. |
| `npm run check` | pass | Biome lint, TypeScript typecheck, dist build, and declaration build exited zero. |
| `npm test` | pass | 345 tests passed; 7 live/smoke tests skipped by default. |
| `npm run package:check` | pass | Packed artifact smoke passed for `@jasonbelmonti/claudex`. |
| Version and scope inspection | pass | Package/root lockfile versions are `4.0.1`; `git diff --check` passes with no dependency, release, ingest, Claude, or Copilot changes. |
| Live/provider operations | not run | Prohibited by scope; no live flag or paid provider command was used. |

# Stop Conditions

- Stop if SDK/CLI/auth/model/service changes or new cross-provider error codes are required.
- Stop if verified upstream behavior permits successful turns without any nonblank completed assistant message.
- Stop if safe details require prompts, stderr, auth, config, or raw payload persistence.
- Stop on unrelated baseline failure, conflicting file work, or materially changed `main`.
- Stop before live/paid use, PE remediation, tag, publish, release execution, merge, or marketplace work; the `4.0.1` metadata change and PR branch push are explicitly authorized.

# Review Boundary

| Boundary | Scope | Approval impact | Notes |
| --- | --- | --- | --- |
| Terminal correctness | in-scope | blocking | Missing/blank completion cannot succeed or create multiple terminals. |
| Diagnostic usefulness/safety | in-scope | blocking | Stable kind/session exist without unsafe data. |
| Compatibility | in-scope | blocking | Preserve code, success, structured output, resume, and raw/cause. |
| Tests/docs | in-scope | blocking | Exercise normalization boundary and actionable consumer contract. |
| Version metadata | in-scope | blocking | Package and lockfile root versions must consistently report `4.0.1` without dependency drift. |
| PE consumer mapping | out-of-scope | non-blocking | Required follow-up, absent from Claudex diff. |
| Upstream repair/live release | out-of-scope | non-blocking | This makes recurrence diagnosable only. |

# Planned Follow-up Work

- Update PE to persist safe Claudex failure kind/session details.
- Fix PE post-staging diff validation separately.
- After both reviews, separately authorize one paid BEL-1337 rerun.
- If failure recurs, use typed evidence for a bounded SDK/CLI investigation.
- Tag/release/publish/adoption remain separate decisions; the `4.0.1` metadata bump is now part of this PR.

# Review Packet Inputs

| Field | Source section | Required mapping | Notes |
| --- | --- | --- | --- |
| objective / intended_behavior_change | Objective/Plan | Safe failures for empty/no-terminal Codex turns | No upstream-repair claim. |
| in_scope / out_of_scope | Execution Scope | All classified rows | Consumer/release work is follow-up. |
| constraints | Context | Compatibility, safe details, raw semantics, Node/npm, no live use | Upstream cause unknown. |
| review_boundary | Review Boundary | Apply rows verbatim | Prevent scope creep. |
| planned_follow_up_work | Follow-up | Copy bullets | Paid rerun is separate. |
| test_or_risk_context | Criteria/Gates/Stops | Focused terminal plus full local validation | Include dogfood evidence. |
| planning_artifacts | Sources | Brief, repo sources/tests/docs, dogfood artifacts | No hidden chat context. |
| diff_or_range | Branch handoff | `0a59254` through implementation HEAD | Reject unrelated changes. |

# Revision Log

| Timestamp | Actor | Change | Checksum |
| --- | --- | --- | --- |
| 2026-07-12T09:12:09-05:00 | codex | Created the Claudex terminal-diagnostics implementation handoff from live dogfood evidence and current `main`. | pending |
| 2026-07-12T09:25:53-05:00 | codex | Completed implementation, tests, documentation, full local validation, packed-artifact verification, and final scope inspection. | pending |
| 2026-07-12T13:21:28-05:00 | codex | Reopened the brief to authorize the operator-requested `4.0.1` package metadata amendment and PR branch push while preserving release-execution non-goals. | pending |
| 2026-07-12T13:23:59-05:00 | codex | Applied `4.0.1`, passed focused/full/build/package validation, and prepared the amended PR scope for commit and push. | pending |
