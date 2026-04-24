# Release Readiness Audit Plan

This plan defines the pre-release audit for the Node-only semver-major
`@jasonbelmonti/claudex` release tracked by `BEL-853`.

## Audit Objective

- Artifact under review: `claudex` on `main` at or after merge commit `5833e27`.
- Audit goal: confirm the repository is ready for final validation, version bump,
  tag, npm publish, and GitHub release.
- Depth: targeted release-readiness audit with deep review for package contract,
  provider runtime behavior, and release automation.
- Constraints: do not implement fixes during the audit. Record findings and
  evidence first, then decide whether any finding blocks release.
- Non-goals: re-litigating the Bun migration, redesigning the normalized SDK
  contract, or expanding the public API.

## System Snapshot

- Public package surface: `src/index.ts`, `src/core/**`, and the package exports
  in `package.json`.
- Provider runtime surface: `src/providers/claudex/**`,
  `src/providers/claude/**`, and `src/providers/codex/**`.
- Passive ingest surface: `src/ingest/**`, exported as
  `@jasonbelmonti/claudex/ingest`.
- Build and package surface: `tsup.config.ts`, `tsconfig.build.json`,
  `scripts/package-check/**`, and `package.json`.
- CI and release automation: `.github/workflows/ci.yml` and
  `.github/workflows/release.yml`.
- Validation commands: `npm run check`, `npm test`, `npm run test:coverage`,
  `npm run package:check`, and optional authenticated smoke tests through
  `npm run test:smoke`.

## Functional Audit Groups

### Group 1: Public API And Package Contract

- Why this is coherent: this is the contract downstream consumers touch first,
  and it must survive clean install, import, and strict TypeScript typecheck.
- Priority: high.
- Review depth: deep review.
- Primary files or directories: `src/index.ts`, `src/core/**`, `package.json`,
  `scripts/package-check/**`, `README.md`, and `docs/consumer-guide.md`.
- Core behaviors to validate:
  - Root and ingest exports resolve only from built `dist` artifacts.
  - A clean consumer can import and typecheck the root and ingest entrypoints
    with `skipLibCheck: false`.
  - README and consumer docs match the package name, Node-only runtime policy,
    and ESM-only module contract.
- Critical assumptions to test:
  - Public types do not leak avoidable SDK internals into ordinary root imports.
  - Package metadata, docs, and generated declarations describe the same API.
- Key failure modes or regressions:
  - Broken package exports.
  - Strict consumer typecheck failure.
  - Stale Bun-first guidance in public docs.
- Adjacent groups or dependencies: Group 4 for package generation and release
  workflow, Group 5 for historical audit reconciliation.
- Suggested reviewer type: package-contract reviewer with TypeScript and npm
  publishing experience.

#### Group 1 Dispatch Packet

- Mission: review the public package contract from clean consumer install to
  runtime import and strict typecheck.
- In scope: root export, ingest export, package metadata, generated declaration
  expectations, README, consumer guide, and `scripts/package-check/**`.
- Out of scope: provider implementation internals except where they leak into
  public types.
- Evidence required:
  - File references for export and type-surface claims.
  - Results or reasoning for `npm run package:check`.
  - Any mismatch between docs and actual package behavior.
- Deliverables:
  - Release-blocking findings, if any.
  - Non-blocking cleanup recommendations.
  - Explicit statement on whether package consumption is release-ready.

### Group 2: Provider Runtime Adapters

- Why this is coherent: provider adapters implement the live SDK behavior behind
  the normalized session contract.
- Priority: high.
- Review depth: deep review.
- Primary files or directories: `src/providers/claudex/**`,
  `src/providers/claude/**`, `src/providers/codex/**`, `test/providers/**`, and
  `test/contract/**`.
- Core behaviors to validate:
  - Readiness status and capability reporting are accurate and stable.
  - `createSession`, `resumeSession`, `run`, and `runStreamed` preserve the
    normalized contract across Claude and Codex.
  - Provider-specific options cannot silently override session-owned safety
    fields such as approval and sandbox settings.
  - Structured output failures are typed and attributable.
- Critical assumptions to test:
  - Provider-specific escape hatches remain additive unless explicitly
    documented otherwise.
  - Raw SDK error and event payloads are preserved without making normalized
    fields ambiguous.
- Key failure modes or regressions:
  - Sandbox or approval policy drift.
  - Incorrect readiness classification.
  - Lost provider metadata or malformed event/result mapping.
  - Silent fallback behavior that hides SDK failures.
- Adjacent groups or dependencies: Group 1 for exposed types, Group 5 for
  regression coverage.
- Suggested reviewer type: runtime-contract reviewer familiar with SDK adapter
  boundaries and safety-sensitive option mapping.

#### Group 2 Dispatch Packet

- Mission: review live provider adapters for correctness, contract drift, and
  safety-sensitive option handling.
- In scope: Claude, Codex, and Claudex provider adapters, sessions, readiness,
  event/result mapping, provider option merging, and provider tests.
- Out of scope: passive ingest parser behavior, except for shared normalized
  event/result assumptions.
- Evidence required:
  - File references for each checked contract path.
  - Test references proving or missing key invariants.
  - Explicit notes for any behavior that depends on live provider availability.
- Deliverables:
  - Prioritized findings.
  - Residual live-smoke risks.
  - Clear release-ready or release-blocked judgment for provider behavior.

### Group 3: Passive Ingest Runtime And Parsers

- Why this is coherent: ingest is a separate read-only observation surface with
  its own lifecycle, cursor, parser, and warning semantics.
- Priority: high.
- Review depth: targeted review.
- Primary files or directories: `src/ingest/runtime.ts`,
  `src/ingest/process-file.ts`, `src/ingest/reconcile.ts`,
  `src/ingest/claude/**`, `src/ingest/codex/**`, and `test/ingest/**`.
- Core behaviors to validate:
  - `start`, `scanNow`, and `reconcileNow` handle watched and non-watched roots
    consistently.
  - Cursor recovery, truncation handling, rotation handling, and duplicate-root
    handling preserve observable state.
  - Root metadata and match metadata propagate consistently into events,
    sessions, and warnings.
  - Malformed or partial artifacts create warnings rather than crashing the
    service.
- Critical assumptions to test:
  - Passive ingest never presents itself as authoritative live session control.
  - Parser failures are contained per file or record where possible.
- Key failure modes or regressions:
  - Dropped records.
  - Duplicate replay.
  - Stale cursor continuation after file mutation.
  - Provider-specific parser drift against fixture expectations.
- Adjacent groups or dependencies: Group 1 for ingest export contract, Group 5
  for fixture and coverage quality.
- Suggested reviewer type: state-machine reviewer with experience in file
  watching, replay, and parser failure containment.

#### Group 3 Dispatch Packet

- Mission: review passive ingest as a best-effort observation system with
  explicit provenance and failure containment.
- In scope: runtime lifecycle, reconciliation, cursor semantics, source
  metadata, warning behavior, Claude parsers, Codex parsers, and ingest tests.
- Out of scope: live provider session behavior.
- Evidence required:
  - File references for lifecycle and cursor invariants.
  - Fixture or test references for parser assumptions.
  - Any uncovered edge case that could affect release confidence.
- Deliverables:
  - Prioritized findings.
  - Fixture or test gaps.
  - Explicit release-readiness assessment for ingest.

### Group 4: Build, CI, And Release Automation

- Why this is coherent: this group owns the exact path from clean checkout to
  verified npm publish.
- Priority: high.
- Review depth: deep review.
- Primary files or directories: `package.json`, `package-lock.json`,
  `tsup.config.ts`, `tsconfig.build.json`, `scripts/dist-package.config.ts`,
  `scripts/package-check/**`, `.github/workflows/ci.yml`, and
  `.github/workflows/release.yml`.
- Core behaviors to validate:
  - CI verifies Node 20, 22, and 24 with the intended command matrix.
  - Release workflow verifies before publish and only publishes on matching
    version tags.
  - `npm pack` content contains the expected built artifacts and no source tree.
  - Publishing is idempotent when a version already exists on npm.
- Critical assumptions to test:
  - Version, tag, and package metadata cannot drift silently.
  - Workflow permissions are minimal but sufficient for npm provenance.
- Key failure modes or regressions:
  - Tag points at a package version mismatch.
  - Workflow dispatch gives false confidence but cannot publish.
  - Package check passes locally but release workflow skips an essential check.
- Adjacent groups or dependencies: Group 1 for package contract, Group 5 for
  validation evidence.
- Suggested reviewer type: release-engineering reviewer with GitHub Actions and
  npm provenance experience.

#### Group 4 Dispatch Packet

- Mission: review the release machinery from clean checkout through package
  verification and npm publish.
- In scope: npm scripts, build configuration, package check scripts, CI
  workflow, release workflow, package version/tag coupling, and publish
  idempotency.
- Out of scope: source-level provider behavior unless it affects build or
  package output.
- Evidence required:
  - Exact command sequence reviewed.
  - Workflow condition analysis.
  - File references for version, tag, registry, and provenance behavior.
- Deliverables:
  - Release-blocking automation risks.
  - Required manual release steps.
  - Confirmation that `BEL-853` can proceed once validation passes.

### Group 5: Release Evidence And Regression Coverage

- Why this is coherent: this pass reconciles prior audit findings, current
  tests, docs, and final release evidence into a go/no-go view.
- Priority: medium.
- Review depth: targeted review.
- Primary files or directories: `test/**`, `docs/node-only-migration.md`,
  `docs/normalized-sdk-plan.md`, `docs/capability-matrix.md`, and any local
  audit notes provided for the release.
- Core behaviors to validate:
  - Prior high-risk audit findings are fixed, intentionally deferred, or marked
    non-blocking with evidence.
  - Tests cover the release-critical contract boundaries.
  - Node-only release notes and migration guidance align with actual support
    policy.
- Critical assumptions to test:
  - High aggregate coverage is not hiding missing contract assertions.
  - Optional live smoke gaps are clearly separated from deterministic release
    blockers.
- Key failure modes or regressions:
  - Stale historical findings treated as current truth.
  - Release notes promise support that CI and package checks do not prove.
  - Missing final validation evidence for `BEL-853`.
- Adjacent groups or dependencies: all groups.
- Suggested reviewer type: release manager or QA reviewer focused on evidence
  quality and go/no-go criteria.

#### Group 5 Dispatch Packet

- Mission: reconcile release evidence into a concise go/no-go view.
- In scope: test matrix, coverage output, package check output, migration docs,
  capability matrix, normalized SDK plan, and prior audit notes if supplied.
- Out of scope: re-reviewing implementation internals already assigned to
  Groups 1 through 4.
- Evidence required:
  - Validation command results.
  - Finding-by-finding disposition for high-risk historical audit items.
  - Clear list of release blockers versus follow-up work.
- Deliverables:
  - Go/no-go recommendation.
  - Evidence checklist for `BEL-853`.
  - Follow-up issues to create only if release-blocking gaps are found.

## Cross-Cutting Review Tracks

- Contract drift: Groups 1, 2, and 3. Confirm docs, public types, runtime
  behavior, and tests describe the same contract.
- Runtime safety: Groups 2 and 4. Confirm approval, sandbox, release
  permissions, and publish authority cannot drift silently.
- Error containment: Groups 2 and 3. Confirm failures are typed, attributable,
  and do not corrupt state or hide release-critical defects.
- Node-only release posture: Groups 1, 4, and 5. Confirm no Bun-only runtime,
  tooling, or documentation assumptions remain in the supported path.
- Test value: all groups. Prefer tests that exercise package, consumer, and
  contract boundaries over tests that only mirror implementation shape.

## Recommended Review Order

1. Group 4: Build, CI, and release automation.
2. Group 1: Public API and package contract.
3. Group 2: Provider runtime adapters.
4. Group 3: Passive ingest runtime and parsers.
5. Group 5: Release evidence and regression coverage.

## Coverage Gaps

- Authenticated Claude and Codex smoke tests require local provider
  availability and may need to be recorded as optional release evidence.
- The exact semver-major target must be confirmed before tag creation. `2.0.0`
  is the natural target from the current `1.0.3` line, but the audit should not
  assume it without confirmation.
- If local audit notes exist outside tracked docs, decide whether they should be
  formal release artifacts before relying on them as evidence.
