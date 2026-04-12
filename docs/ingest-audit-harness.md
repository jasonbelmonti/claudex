# Ingest Audit Harness

This document is the maintainer-facing foundation for the passive-ingest audit
stream. It pairs with [test/ingest/audit-matrix.ts](../test/ingest/audit-matrix.ts),
which is the executable source of truth for scenario ids, baseline status, and
live-fixture provenance requirements.

## Purpose

The ingest suite already has meaningful coverage. The next step is to treat it
as an evolving audit harness instead of a flat pile of tests.

The harness must do four things:

1. Name the scenarios we care about.
2. Record which scenarios are already covered vs partially covered vs planned.
3. Keep deterministic fixture probes separate from opt-in live validation.
4. Stay extensible as Claude and Codex artifact shapes drift over time.

## Baseline Snapshot

Baseline captured on April 9, 2026 from a clean local checkout:

- Command: `bun test test/ingest test/ingest-public-api.test.ts`
- Result: `109 pass`, `1 skip`, `20 files`, `668 expect() calls`
- Command: `bun test --coverage --coverage-reporter=text test/ingest test/ingest-public-api.test.ts`
- Coverage: `97.29%` functions, `97.13%` lines

BEL-632 closes the original Codex normalization hotspot list with direct probes
and named fixtures:

- `src/ingest/codex/normalize-response-item-function-call.ts` at `100%` lines
- `src/ingest/codex/normalize-tool-helpers.ts` at `95.65%` lines
- `src/ingest/codex/normalize-usage.ts` at `97.44%` lines
- `src/ingest/codex/normalize-response-item-custom-tool.ts` at `100%` lines
- `src/ingest/codex/normalize-response-item-message.ts` at `100%` lines
- `src/ingest/codex/normalize-state.ts` at `98%` lines
- `src/ingest/codex/normalize-event-msg.ts` at `100%` lines

The main remaining low-coverage areas are no longer concentrated in Codex
normalization and fall outside the BEL-632 scope.

## Supported Source Families

The harness is intentionally scoped to the current passive-ingest contract:

- Claude transcript `.jsonl`
- Claude snapshot or task `.json`
- Codex transcript `.jsonl`
- Codex session-index `.jsonl`

If a new provider artifact becomes part of the public contract later, add a new
source family in the matrix first. Do not quietly fold it into an existing row.

## Audit Matrix

The matrix currently tracks four classes of work:

- Shared runtime invariants across scan, reconcile, watch, and cursor recovery
- Claude artifact replay behavior
- Codex artifact replay behavior
- Opt-in live parity captures for both providers

Each scenario entry carries:

- a stable scenario id
- one or more source families
- probe kind: `deterministic-fixture` or `live-capture`
- baseline status: `covered`, `partial`, or `planned`
- asserted invariants
- links to the current coverage files

The initial rows are intentionally opinionated:

- runtime and cursor behavior is already `covered` or `partial`
- Claude replay is mostly `covered`
- Codex branch-heavy normalization is `covered`
- live replay parity is now `covered`, but still opt-in in the default run

That gives later tickets a stable place to extend coverage without redefining
scope every time dependencies move.

## Deterministic vs Live

Deterministic fixture probes are the default audit path:

- they run in normal local development
- they stay stable in CI
- they are the primary correctness oracle
- stable entrypoint: `bun run audit:ingest`
- default report outputs:
  - `out/ingest-audit/report.json`
  - `out/ingest-audit/report.txt`

Live capture probes are validation, not the default oracle:

- they stay opt-in
- they verify that real provider artifacts still replay through the same matrix
- they exist to catch dependency drift, not to replace deterministic fixtures
- current Claude entrypoint: `bun run audit:ingest:live:claude`
- current Codex entrypoint: `bun run audit:ingest:live:codex`

Future automation should run deterministic probes on every change and reserve
live refresh for explicit upgrade or verification workflows.

## Report Contract

`bun run audit:ingest` emits both a machine-readable JSON report and a short
maintainer-facing text summary from the same underlying contract.

The report shape is designed to stay small and stable:

- `commands` records the deterministic test and coverage invocations, exit
  status, durations, and captured stdout or stderr paths
- `scenarios` projects the current audit matrix into an execution-oriented
  inventory keyed by stable scenario ids
- `findings.confirmedRegressions` maps failing deterministic test files back to
  matrix scenario ids via each row's existing coverage targets
- `findings.unsupportedButObserved` is reserved for sidecar-declared
  unsupported-but-observed artifacts without treating them as silent noise
- `findings.intentionallyUnasserted` keeps partial or opt-in rows visible
  instead of pretending the default harness covers more than it does
- live scenarios now record `liveParityStatus`, current fixture heads, and any
  superseded fixture revisions so dependency upgrades have explicit lineage
- `coverage` records aggregate line and function percentages from the
  deterministic coverage run

The report also records enough provenance to make later upgrade comparisons
boring in the good way:

- repo package version
- git branch, commit sha, and dirty state
- Bun version and package manager string
- Claude SDK and Codex SDK dependency versions
- live sidecar fixture provenance for any opt-in scenarios already captured

If later automation wants to compare dependency upgrades, it should compare the
JSON report artifacts across runs rather than infer state from raw console
output.

## Fixture Extension Model

When adding a new scenario or artifact variant:

1. Add or update the scenario entry in `test/ingest/audit-matrix.ts`.
2. Decide whether it belongs in deterministic coverage, live validation, or
   both.
3. Add the fixture artifact under `test/fixtures/<provider>/`.
4. If the fixture came from a live capture, add an adjacent sidecar ending in
   `.fixture.json`.
5. Add or update the provider refresh manifest so the fixture becomes a
   declared lineage head or superseded revision.
6. Wire the scenario into the relevant test file.
7. Re-run the baseline commands and update the recorded snapshot only when the
   new result is intentional.

This is the key rule for harness evolution: new provider variants become new
rows or deliberate revisions, not ad hoc test rewrites.

## Live Fixture Provenance

Every sanitized live fixture sidecar should record:

- `scenarioId`
- `provider`
- `sourceFamilies`
- `capturedAt`
- `captureKind`
- `artifactVersion`
- `providerVersion`
- `sdkVersion`
- `sanitizerVersion`
- `sanitizedBy`

The sidecar exists so future upgrade flows can answer three concrete questions:

1. Which scenario is this fixture asserting?
2. Which dependency version produced it?
3. Was the fixture refreshed intentionally or did drift slip in unnoticed?

Machine-specific paths and secrets should be removed during sanitization, but
replay-relevant structure must remain intact.

The deterministic audit report reads these sidecars as metadata, even when live
tests are not executed, so upgrade-readiness provenance stays visible in the
default harness output.

## Live Refresh Contract

BEL-633 defines the shared refresh contract for live fixtures. The eventual
workflow is now represented as provider-local `refresh-manifest.json` files,
and the contract itself is stable:

- live refresh stays opt-in and never becomes a CI dependency
- `scenarioId` stays stable across fixture revisions
- refreshes are append-only; they add a new revision instead of overwriting the
  prior artifact in place
- provenance history is retained so later upgrades can compare the new capture
  against the previous one without guessing
- the refresh record must name which artifact is current and which artifact it
  supersedes
- every checked-in live sidecar must be declared in a refresh manifest
- the audit report treats refresh manifests as the authoritative source for
  current heads and superseded revisions

BEL-633 owns this shared capture and refresh mechanics. BEL-631 separately
owns Claude-specific parity assertions, so this slice must not absorb the
provider-specific assertion work.

## Next Tickets

This foundation is designed so the follow-on work is additive:

- runtime fault and timeline expansion
- upgrade automation that diffs current lineage heads against refreshed captures
- unsupported-but-observed triage when new provider artifact shapes appear
- adjacent runtime hardening for low-coverage provider event and result branches

If a later ticket needs to change the matrix itself, that should be a deliberate
contract update rather than an incidental side effect.
