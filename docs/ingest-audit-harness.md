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
- Result: `82 pass`, `13 files`, `316 expect() calls`
- Command: `bun test --coverage --coverage-reporter=text test/ingest test/ingest-public-api.test.ts`
- Coverage: `91.22%` functions, `87.09%` lines

Current confidence is strongest in the shared runtime and cursor path. The main
remaining blind spots are concentrated in Codex normalization branches:

- `src/ingest/codex/normalize-response-item-function-call.ts`
- `src/ingest/codex/normalize-tool-helpers.ts`
- `src/ingest/codex/normalize-usage.ts`
- `src/ingest/codex/normalize-response-item-custom-tool.ts`
- `src/ingest/codex/normalize-response-item-message.ts`
- `src/ingest/codex/normalize-state.ts`
- `src/ingest/codex/normalize-event-msg.ts`

Those hotspots are recorded in the executable matrix so later tickets can close
them with named scenario coverage instead of only chasing percentages.

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
- Codex branch-heavy normalization is `partial`
- live replay parity remains `planned`

That gives later tickets a stable place to extend coverage without redefining
scope every time dependencies move.

## Deterministic vs Live

Deterministic fixture probes are the default audit path:

- they run in normal local development
- they stay stable in CI
- they are the primary correctness oracle

Live capture probes are validation, not the default oracle:

- they stay opt-in
- they verify that real provider artifacts still replay through the same matrix
- they exist to catch dependency drift, not to replace deterministic fixtures

Future automation should run deterministic probes on every change and reserve
live refresh for explicit upgrade or verification workflows.

## Fixture Extension Model

When adding a new scenario or artifact variant:

1. Add or update the scenario entry in `test/ingest/audit-matrix.ts`.
2. Decide whether it belongs in deterministic coverage, live validation, or
   both.
3. Add the fixture artifact under `test/fixtures/<provider>/`.
4. If the fixture came from a live capture, add an adjacent sidecar ending in
   `.fixture.json`.
5. Wire the scenario into the relevant test file.
6. Re-run the baseline commands and update the recorded snapshot only when the
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

## Next Tickets

This foundation is designed so the follow-on work is additive:

- runtime fault and timeline expansion
- Claude fixture completion and live parity
- Codex branch-expansion and live parity
- audit reporting and upgrade-readiness entrypoints

If a later ticket needs to change the matrix itself, that should be a deliberate
contract update rather than an incidental side effect.

