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
  refreshContract?: IngestLiveFixtureRefreshContract;
  notes?: string;
};

export type IngestAuditScenarioChecklistItem = {
  id: string;
  family: string;
  focus: string;
  coverageTargets: readonly string[];
};

export type IngestLiveFixtureMetadataRequirements = {
  sidecarSuffix: string;
  requiredFields: readonly string[];
  notes: readonly string[];
};

export type IngestLiveFixtureRefreshContract = {
  manifestPath: string;
  requiredFields: readonly string[];
  executionMode: "opt-in";
  revisionPolicy: "append-only";
  scenarioIdentityPolicy: "stable";
  provenanceHistoryPolicy: "preserve-prior-revisions";
  notes: readonly string[];
};

export const INGEST_AUDIT_BASELINE_COMMANDS = [
  "npm exec -- vitest run test/ingest test/ingest-public-api.test.ts",
  "npm exec -- vitest run --coverage --coverage.reporter=text test/ingest test/ingest-public-api.test.ts",
] as const;

export const INGEST_AUDIT_KNOWN_BLIND_SPOTS: readonly IngestAuditCoverageHotspot[] = [];

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
  passingTests: 109,
  testFiles: 20,
  expectCalls: 668,
  coverage: {
    functionPct: 97.29,
    linePct: 97.13,
  },
  knownBlindSpots: INGEST_AUDIT_KNOWN_BLIND_SPOTS,
} as const;

export const INGEST_LIVE_FIXTURE_METADATA = {
  sidecarSuffix: ".fixture.json",
  requiredFields: INGEST_LIVE_FIXTURE_REQUIRED_FIELDS,
  notes: [
    "Live-capture fixtures stay opt-in and must never become a required CI dependency.",
    "Sidecars should retain replay-relevant structure while stripping secrets and machine-specific paths.",
    "Refreshing a live fixture should add or update scenario expectations without erasing provenance history or prior revisions.",
  ],
} as const satisfies IngestLiveFixtureMetadataRequirements;

export const INGEST_LIVE_FIXTURE_REFRESH_CONTRACT = {
  manifestPath: "refresh-manifest.json",
  requiredFields: [
    "scenarioId",
    "provider",
    "sourceFamilies",
    "fixturePath",
    "supersedesFixturePath",
    "capturedAt",
    "captureKind",
    "artifactVersion",
    "providerVersion",
    "sdkVersion",
    "sanitizerVersion",
    "sanitizedBy",
    "provenanceHistory",
  ],
  executionMode: "opt-in",
  revisionPolicy: "append-only",
  scenarioIdentityPolicy: "stable",
  provenanceHistoryPolicy: "preserve-prior-revisions",
  notes: [
    "The refresh manifest is declarative contract data, not a runnable workflow; later scripts may encode the same shape as a manifest file or equivalent sidecar-backed record.",
    "A refresh must preserve scenario identity, keep prior revisions discoverable, and record which artifact replaces which earlier fixture.",
  ],
} as const satisfies IngestLiveFixtureRefreshContract;

export const CODEX_TRANSCRIPT_BRANCH_EXPANSION_CHECKLIST = [
  {
    id: "codex-message-turn-start-and-mirror-collapse",
    family: "message",
    focus:
      "Response-item and event-message user or assistant branches cover turn start, mirror collapse, duplicate suppression, and developer-only no-op records.",
    coverageTargets: [
      "src/ingest/codex/normalize-response-item-message.ts",
      "src/ingest/codex/normalize-event-msg.ts",
      "test/ingest/codex-normalize-state-message.test.ts",
      "test/ingest/codex-audit-fixtures.test.ts",
    ],
  },
  {
    id: "codex-reasoning-summary-and-encrypted-fallback",
    family: "message",
    focus:
      "Reasoning branches cover summary extraction, encrypted-content fallback, and mirror de-duplication between event_msg and response_item records.",
    coverageTargets: [
      "src/ingest/codex/normalize-response-item-message.ts",
      "src/ingest/codex/normalize-event-msg.ts",
      "test/ingest/codex-normalize-state-message.test.ts",
      "test/ingest/codex-audit-fixtures.test.ts",
    ],
  },
  {
    id: "codex-function-call-descriptors-and-output-outcomes",
    family: "function-tool-custom-tool",
    focus:
      "Function-call normalization covers command and MCP descriptor inference, parsed inputs, unsupported missing identifiers, orphaned completions, and outcome mapping.",
    coverageTargets: [
      "src/ingest/codex/normalize-response-item-function-call.ts",
      "src/ingest/codex/normalize-tool-helpers.ts",
      "test/ingest/codex-normalize-tooling.test.ts",
    ],
  },
  {
    id: "codex-custom-tool-and-web-search-replay",
    family: "function-tool-custom-tool",
    focus:
      "Custom-tool and web-search normalization covers explicit call ids, latest-pending reuse, missing identifiers, and synthetic completion ids when no pending search exists.",
    coverageTargets: [
      "src/ingest/codex/normalize-response-item-custom-tool.ts",
      "src/ingest/codex/normalize-tool-helpers.ts",
      "test/ingest/codex-normalize-tooling.test.ts",
      "test/ingest/codex-audit-fixtures.test.ts",
    ],
  },
  {
    id: "codex-state-roundtrip-and-turn-resets",
    family: "state",
    focus:
      "Persisted normalization state round-trips session, turn, pending tool, and synthetic-id metadata while dropping invalid persisted shapes and resetting stale turn state on new tasks or session metadata.",
    coverageTargets: [
      "src/ingest/codex/normalize-state.ts",
      "src/ingest/codex/normalize-event-msg.ts",
      "src/ingest/codex/normalize.ts",
      "test/ingest/codex-normalize-state-message.test.ts",
    ],
  },
  {
    id: "codex-usage-snapshot-variants",
    family: "usage",
    focus:
      "Usage extraction covers total_token_usage and last_token_usage variants, invalid partial usage payloads, and mapping into normalized agent usage on turn completion.",
    coverageTargets: [
      "src/ingest/codex/normalize-usage.ts",
      "src/ingest/codex/normalize-event-msg.ts",
      "test/ingest/codex-normalize-tooling.test.ts",
      "test/ingest/codex-normalize-state-message.test.ts",
    ],
  },
  {
    id: "codex-malformed-and-unsupported-records",
    family: "malformed-unsupported",
    focus:
      "Malformed JSON, missing payload identifiers, unsupported transcript record types, and unsupported response item variants surface warnings with file attribution instead of crashing replay.",
    coverageTargets: [
      "src/ingest/codex/normalize.ts",
      "src/ingest/codex/normalize-event-msg.ts",
      "src/ingest/codex/normalize-response-item.ts",
      "test/ingest/codex-normalize-state-message.test.ts",
      "test/ingest/codex-audit-fixtures.test.ts",
    ],
  },
  {
    id: "codex-incremental-replay-dedup",
    family: "incremental-replay-parity",
    focus:
      "Incremental replay preserves mirror collapse, avoids duplicate event or result emission across cursor resumes, and only emits the newly completed semantic turn outcome.",
    coverageTargets: [
      "test/fixtures/codex/transcript-incremental-replay.initial.jsonl",
      "test/fixtures/codex/transcript-incremental-replay.resumed.jsonl",
      "test/ingest/codex-audit-fixtures.test.ts",
    ],
  },
  {
    id: "codex-provisional-to-canonical-refinement",
    family: "incremental-replay-parity",
    focus:
      "Session-index bootstrap fixtures refine into canonical transcript-backed session identity without inventing duplicate sessions or losing file attribution.",
    coverageTargets: [
      "test/fixtures/codex/session-index-provisional-refinement.jsonl",
      "test/fixtures/codex/transcript-provisional-refinement.jsonl",
      "test/ingest/codex-audit-fixtures.test.ts",
    ],
  },
  {
    id: "codex-live-transcript-parity-excerpt",
    family: "live-parity",
    focus:
      "A sanitized live Codex transcript excerpt replays through the same harness and compares the observed event sequence against declared sidecar expectations.",
    coverageTargets: [
      "test/fixtures/codex/live-transcript-excerpt.jsonl",
      "test/fixtures/codex/live-transcript-excerpt.fixture.json",
      "test/ingest/codex-live-parity.test.ts",
    ],
  },
] as const satisfies readonly IngestAuditScenarioChecklistItem[];

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
    baselineStatus: "covered",
    dimensions: ["runtime", "warning-propagation", "completeness"],
    invariants: [
      "delete and recreate timelines do not leave stale cursors behind",
      "same-inode rewrites do not persist cursors past invalid continuity checkpoints",
      "callback failures preserve the original consumer error and committed cursor state",
    ],
    existingCoverage: [
      "test/ingest/runtime.test.ts",
      "test/ingest/watch-runtime.test.ts",
      "test/ingest/runtime-consumer-failures.test.ts",
      "test/ingest/cursor-recovery-migration.test.ts",
    ],
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
    baselineStatus: "covered",
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
      "test/ingest/codex-normalize-tooling.test.ts",
      "test/ingest/codex-normalize-state-message.test.ts",
      "test/ingest/codex-transcript-parser.test.ts",
      "test/ingest/codex-audit-fixtures.test.ts",
    ],
    notes:
      "BEL-632 closed the matrix checklist in CODEX_TRANSCRIPT_BRANCH_EXPANSION_CHECKLIST and moved the targeted Codex normalization hotspots above 90% line coverage.",
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
    baselineStatus: "covered",
    refreshContract: INGEST_LIVE_FIXTURE_REFRESH_CONTRACT,
    dimensions: [
      "parser-acceptance",
      "normalization",
      "completeness",
      "warning-propagation",
    ],
    invariants: [
      "sanitized live transcript and snapshot artifacts retain enough structure to replay through the deterministic harness",
      "fixture sidecars record provider and artifact provenance needed for upgrade comparisons",
      "unsupported-but-observed shapes are documented explicitly instead of being silently ignored",
    ],
    existingCoverage: ["test/ingest/claude-live-parity.test.ts"],
    notes:
      "BEL-631 seeded transcript parity; the current matrix now includes manifest-backed Claude transcript and snapshot live parity fixtures.",
  },
  {
    id: "live-codex-replay-parity",
    title: "Sanitized live Codex artifacts replay through the same audit matrix",
    sourceFamilies: ["codex-transcript", "codex-session-index"],
    probeKind: "live-capture",
    baselineStatus: "covered",
    refreshContract: INGEST_LIVE_FIXTURE_REFRESH_CONTRACT,
    dimensions: [
      "parser-acceptance",
      "normalization",
      "session-identity",
      "warning-propagation",
    ],
    invariants: [
      "live transcript and session-index artifacts map back to stable scenario identifiers",
      "provenance sidecars make dependency-version diffs possible without guessing capture history",
      "new Codex artifact variants are introduced as new matrix rows or fixture revisions instead of ad hoc test rewrites",
    ],
    existingCoverage: ["test/ingest/codex-live-parity.test.ts"],
    notes:
      "BEL-632 seeded transcript parity; the current matrix now includes manifest-backed Codex transcript and session-index live parity fixtures.",
  },
] as const satisfies readonly IngestAuditScenario[];
