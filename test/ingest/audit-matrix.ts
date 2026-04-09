export const INGEST_AUDIT_SOURCE_FAMILIES = [
  "claude-transcript",
  "claude-snapshot-task",
  "codex-transcript",
  "codex-session-index",
] as const;

export type IngestAuditSourceFamily =
  (typeof INGEST_AUDIT_SOURCE_FAMILIES)[number];

export const INGEST_AUDIT_DIMENSIONS = [
  "parser-acceptance",
  "normalization",
  "runtime",
  "session-identity",
  "completeness",
  "warning-propagation",
] as const;

export type IngestAuditDimension = (typeof INGEST_AUDIT_DIMENSIONS)[number];

export const INGEST_AUDIT_PROBE_KINDS = [
  "deterministic-fixture",
  "live-capture",
] as const;

export type IngestAuditProbeKind = (typeof INGEST_AUDIT_PROBE_KINDS)[number];

export const INGEST_AUDIT_BASELINE_STATUSES = [
  "covered",
  "partial",
  "planned",
] as const;

export type IngestAuditBaselineStatus =
  (typeof INGEST_AUDIT_BASELINE_STATUSES)[number];

export type IngestAuditCoverageHotspot = {
  path: string;
  lineCoveragePct: number;
  rationale: string;
};

export type IngestAuditScenario = {
  id: string;
  title: string;
  sourceFamilies: readonly IngestAuditSourceFamily[];
  probeKind: IngestAuditProbeKind;
  baselineStatus: IngestAuditBaselineStatus;
  dimensions: readonly IngestAuditDimension[];
  invariants: readonly string[];
  existingCoverage: readonly string[];
  notes?: string;
};

export type IngestLiveFixtureMetadataRequirements = {
  sidecarSuffix: string;
  requiredFields: readonly string[];
  notes: readonly string[];
};

export const INGEST_AUDIT_BASELINE_COMMANDS = [
  "bun test test/ingest test/ingest-public-api.test.ts",
  "bun test --coverage --coverage-reporter=text test/ingest test/ingest-public-api.test.ts",
] as const;

export const INGEST_AUDIT_KNOWN_BLIND_SPOTS = [
  {
    path: "src/ingest/codex/normalize-response-item-function-call.ts",
    lineCoveragePct: 5.62,
    rationale:
      "Function call and function_call_output branches do not yet have direct audit scenarios.",
  },
  {
    path: "src/ingest/codex/normalize-tool-helpers.ts",
    lineCoveragePct: 11.11,
    rationale:
      "Tool descriptor inference and outcome classification need branch-focused probes.",
  },
  {
    path: "src/ingest/codex/normalize-usage.ts",
    lineCoveragePct: 11.36,
    rationale:
      "Usage extraction variants are only exercised indirectly by the current suite.",
  },
  {
    path: "src/ingest/codex/normalize-response-item-custom-tool.ts",
    lineCoveragePct: 51.65,
    rationale:
      "Custom-tool payload variants and malformed branches need explicit coverage.",
  },
  {
    path: "src/ingest/codex/normalize-response-item-message.ts",
    lineCoveragePct: 40.0,
    rationale:
      "Assistant message content permutations need dedicated fixture rows instead of incidental coverage.",
  },
  {
    path: "src/ingest/codex/normalize-state.ts",
    lineCoveragePct: 67.68,
    rationale:
      "Turn-state transitions and stale-state resets need stronger direct assertions.",
  },
  {
    path: "src/ingest/codex/normalize-event-msg.ts",
    lineCoveragePct: 67.56,
    rationale:
      "Event-message variants still rely too heavily on aggregate transcript fixtures.",
  },
] as const satisfies readonly IngestAuditCoverageHotspot[];

export const INGEST_LIVE_FIXTURE_REQUIRED_FIELDS = [
  "scenarioId",
  "provider",
  "sourceFamilies",
  "capturedAt",
  "captureKind",
  "artifactVersion",
  "providerVersion",
  "sdkVersion",
  "sanitizerVersion",
  "sanitizedBy",
] as const;

export const INGEST_AUDIT_BASELINE = {
  capturedAt: "2026-04-09",
  commands: INGEST_AUDIT_BASELINE_COMMANDS,
  passingTests: 82,
  testFiles: 13,
  expectCalls: 316,
  coverage: {
    functionPct: 91.22,
    linePct: 87.09,
  },
  knownBlindSpots: INGEST_AUDIT_KNOWN_BLIND_SPOTS,
} as const;

export const INGEST_LIVE_FIXTURE_METADATA = {
  sidecarSuffix: ".fixture.json",
  requiredFields: INGEST_LIVE_FIXTURE_REQUIRED_FIELDS,
  notes: [
    "Live-capture fixtures stay opt-in and must never become a required CI dependency.",
    "Sidecars should retain replay-relevant structure while stripping secrets and machine-specific paths.",
    "Refreshing a live fixture should add or update scenario expectations rather than silently replacing the audit baseline.",
  ],
} as const satisfies IngestLiveFixtureMetadataRequirements;

export const INGEST_AUDIT_SCENARIOS = [
  {
    id: "shared-runtime-scan-reconcile-cursor",
    title: "Shared runtime preserves deterministic scan, reconcile, and cursor behavior",
    sourceFamilies: INGEST_AUDIT_SOURCE_FAMILIES,
    probeKind: "deterministic-fixture",
    baselineStatus: "covered",
    dimensions: ["runtime", "warning-propagation", "completeness"],
    invariants: [
      "scanNow and reconcileNow do not duplicate unchanged semantic records",
      "persisted cursors only advance after durable parse progress",
      "warnings surface parse or file failures without crashing the service",
    ],
    existingCoverage: [
      "test/ingest/runtime.test.ts",
      "test/ingest/watch-runtime.test.ts",
      "test/ingest/runtime-consumer-failures.test.ts",
      "test/ingest/cursor-recovery-migration.test.ts",
    ],
  },
  {
    id: "shared-runtime-adversarial-timelines",
    title: "Shared runtime tolerates mutation timelines without drifting cursors or ordering",
    sourceFamilies: INGEST_AUDIT_SOURCE_FAMILIES,
    probeKind: "deterministic-fixture",
    baselineStatus: "partial",
    dimensions: ["runtime", "warning-propagation", "completeness"],
    invariants: [
      "delete and recreate timelines do not leave stale cursors behind",
      "same-inode rewrites do not persist cursors past invalid continuity checkpoints",
      "callback failures preserve the original consumer error and committed cursor state",
    ],
    existingCoverage: [
      "test/ingest/runtime.test.ts",
      "test/ingest/watch-runtime.test.ts",
      "test/ingest/cursor-recovery-migration.test.ts",
    ],
    notes:
      "BEL-630 expands this row into reusable scenario builders instead of more bespoke one-off cases.",
  },
  {
    id: "claude-transcript-incremental-replay",
    title: "Claude transcript replay handles malformed lines, fallbacks, and incremental resumes",
    sourceFamilies: ["claude-transcript"],
    probeKind: "deterministic-fixture",
    baselineStatus: "covered",
    dimensions: [
      "parser-acceptance",
      "normalization",
      "completeness",
      "warning-propagation",
    ],
    invariants: [
      "malformed transcript lines become warnings instead of fatal parser crashes",
      "assistant and result fallbacks remain stable across incremental replay and reconcile passes",
      "unsupported records carry file attribution so later probes can locate the raw artifact",
    ],
    existingCoverage: [
      "test/ingest/claude-transcript-parser.test.ts",
      "test/ingest/claude-normalize.test.ts",
    ],
  },
  {
    id: "claude-snapshot-replay-recovery",
    title: "Claude snapshot or task replay preserves array normalization and replay progress resets",
    sourceFamilies: ["claude-snapshot-task"],
    probeKind: "deterministic-fixture",
    baselineStatus: "covered",
    dimensions: [
      "parser-acceptance",
      "normalization",
      "runtime",
      "warning-propagation",
    ],
    invariants: [
      "array and object payload shapes normalize into equivalent observed records",
      "partial replay state resets when an in-place rewrite invalidates prior progress",
      "unsupported or malformed snapshot records surface as non-fatal warnings",
    ],
    existingCoverage: [
      "test/ingest/claude-snapshot-task-parser.test.ts",
      "test/ingest/claude-normalize.test.ts",
    ],
  },
  {
    id: "codex-transcript-core-parity",
    title: "Codex transcript replay preserves mirror-collapse and canonical turn completion",
    sourceFamilies: ["codex-transcript"],
    probeKind: "deterministic-fixture",
    baselineStatus: "covered",
    dimensions: [
      "parser-acceptance",
      "normalization",
      "session-identity",
      "warning-propagation",
    ],
    invariants: [
      "mirrored assistant and reasoning records collapse to single semantic events",
      "turn_context-only or blank files do not invent canonical sessions",
      "session.started and turn.completed semantics stay stable across incremental replay",
    ],
    existingCoverage: [
      "test/ingest/codex-transcript-parser.test.ts",
      "test/ingest/codex-normalize.test.ts",
    ],
  },
  {
    id: "codex-transcript-branch-expansion",
    title: "Codex transcript branch coverage captures tool, state, message, and usage edge cases",
    sourceFamilies: ["codex-transcript"],
    probeKind: "deterministic-fixture",
    baselineStatus: "partial",
    dimensions: [
      "parser-acceptance",
      "normalization",
      "warning-propagation",
      "completeness",
    ],
    invariants: [
      "function, custom-tool, message, and reasoning response-item branches each have direct probes",
      "stale state and missing identifier paths emit expected unsupported-record outcomes",
      "usage extraction variants are asserted independently from higher-level transcript success cases",
    ],
    existingCoverage: [
      "test/ingest/codex-normalize.test.ts",
      "test/ingest/codex-transcript-parser.test.ts",
    ],
    notes:
      "BEL-632 is expected to drive most of the coverage and fixture growth for this row.",
  },
  {
    id: "codex-session-index-bootstrap",
    title: "Codex session-index replay preserves provisional identity and partial-line handling",
    sourceFamilies: ["codex-session-index"],
    probeKind: "deterministic-fixture",
    baselineStatus: "covered",
    dimensions: [
      "parser-acceptance",
      "session-identity",
      "completeness",
      "warning-propagation",
    ],
    invariants: [
      "bootstrap records remain provisional until transcript-backed identity arrives",
      "malformed or partial lines degrade completeness instead of aborting ingest",
      "hyphenated and underscored filename variants both match the supported registry",
    ],
    existingCoverage: [
      "test/ingest/codex-session-index-parser.test.ts",
      "test/ingest/runtime.test.ts",
    ],
  },
  {
    id: "live-claude-replay-parity",
    title: "Sanitized live Claude artifacts replay through the same audit matrix",
    sourceFamilies: ["claude-transcript", "claude-snapshot-task"],
    probeKind: "live-capture",
    baselineStatus: "planned",
    dimensions: [
      "parser-acceptance",
      "normalization",
      "completeness",
      "warning-propagation",
    ],
    invariants: [
      "sanitized live artifacts retain enough structure to replay through the deterministic harness",
      "fixture sidecars record provider and artifact provenance needed for upgrade comparisons",
      "unsupported-but-observed shapes are documented explicitly instead of being silently ignored",
    ],
    existingCoverage: [],
    notes:
      "BEL-633 supplies the capture and sanitization workflow; BEL-631 adds the Claude-specific parity assertions.",
  },
  {
    id: "live-codex-replay-parity",
    title: "Sanitized live Codex artifacts replay through the same audit matrix",
    sourceFamilies: ["codex-transcript", "codex-session-index"],
    probeKind: "live-capture",
    baselineStatus: "planned",
    dimensions: [
      "parser-acceptance",
      "normalization",
      "session-identity",
      "warning-propagation",
    ],
    invariants: [
      "live transcript and bootstrap artifacts map back to stable scenario identifiers",
      "provenance sidecars make dependency-version diffs possible without guessing capture history",
      "new Codex artifact variants are introduced as new matrix rows or fixture revisions instead of ad hoc test rewrites",
    ],
    existingCoverage: [],
    notes:
      "BEL-633 supplies capture and sanitization; BEL-632 closes the remaining Codex normalization gaps.",
  },
] as const satisfies readonly IngestAuditScenario[];
