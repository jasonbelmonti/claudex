import { expect, test } from "bun:test";

import * as ingest from "@jasonbelmonti/claudex/ingest";

import type {
  CursorStore,
  DiscoveryEvent,
  DiscoveryEventType,
  DiscoveryPhase,
  DiscoveryRootConfig,
  IngestCursor,
  IngestCursorKey,
  IngestFileMatch,
  IngestParseContext,
  IngestProviderRegistry,
  IngestWarning,
  IngestWarningCode,
  ObservedAgentEvent,
  ObservedEventCompleteness,
  ObservedEventLocation,
  ObservedEventSource,
  ObservedEventSourceKind,
  ObservedIngestRecord,
  ObservedSessionIdentity,
  ObservedSessionIdentityState,
  ObservedSessionRecord,
  ObservedSessionReason,
  SessionIngestService,
  SessionIngestServiceOptions,
} from "@jasonbelmonti/claudex/ingest";

const EXPECTED_INGEST_RUNTIME_EXPORTS = [
  "CLAUDE_INGEST_COMPLETENESS",
  "DISCOVERY_EVENT_TYPES",
  "DISCOVERY_PHASES",
  "INGEST_WARNING_CODES",
  "OBSERVED_EVENT_COMPLETENESS",
  "OBSERVED_EVENT_SOURCE_KINDS",
  "OBSERVED_SESSION_IDENTITY_STATES",
  "OBSERVED_SESSION_REASONS",
  "createClaudeArtifactNormalizationContext",
  "createClaudeArtifactNormalizationMetadata",
  "createClaudeIngestRegistries",
  "createClaudeSnapshotTaskIngestRegistry",
  "createClaudeTranscriptIngestRegistry",
  "createCodexIngestCursor",
  "createCodexIngestRegistries",
  "createCodexIngestSource",
  "createCodexObservedEventRecord",
  "createCodexObservedSessionRecord",
  "createCodexSessionIndexIngestRegistry",
  "createCodexTranscriptIngestRegistry",
  "createCodexTranscriptNormalizationContext",
  "createCodexTranscriptNormalizationMetadata",
  "createInMemoryCursorStore",
  "createIngestCursor",
  "createIngestSource",
  "createObservedEventRecord",
  "createObservedSessionIdentity",
  "createObservedSessionRecord",
  "createSessionIngestService",
  "isRecord",
  "normalizeClaudeArtifactRecord",
  "normalizeCodexTranscriptRecord",
  "parseCodexSessionIndexFile",
  "parseCodexTranscriptFile",
  "parseSnapshotTaskFile",
  "parseTranscriptFile",
  "toObservedRecordIterable",
  "withCodexIngestWarnings",
  "withIngestWarnings",
] as const satisfies ReadonlyArray<keyof typeof ingest>;

test("public ingest api exposes the documented runtime surface", () => {
  expect(Object.keys(ingest).sort()).toEqual([...EXPECTED_INGEST_RUNTIME_EXPORTS]);
  expect(ingest.OBSERVED_EVENT_COMPLETENESS).toEqual([
    "complete",
    "partial",
    "best-effort",
  ]);
  expect(ingest.OBSERVED_EVENT_SOURCE_KINDS).toEqual([
    "transcript",
    "snapshot",
    "session-index",
  ]);
  expect(ingest.DISCOVERY_PHASES).toEqual([
    "initial_scan",
    "watch",
    "reconcile",
  ]);
  expect(ingest.OBSERVED_SESSION_IDENTITY_STATES).toEqual([
    "canonical",
    "provisional",
  ]);
  expect(ingest.OBSERVED_SESSION_REASONS).toEqual([
    "bootstrap",
    "index",
    "snapshot",
    "transcript",
    "reconcile",
  ]);
  expect(ingest.INGEST_WARNING_CODES).toEqual([
    "watch-failed",
    "file-open-failed",
    "parse-failed",
    "unsupported-record",
    "duplicate-root",
    "cursor-reset",
    "truncated-file",
    "rotated-file",
  ]);
  expect(ingest.DISCOVERY_EVENT_TYPES).toEqual([
    "scan.started",
    "scan.completed",
    "watch.started",
    "watch.stopped",
    "reconcile.started",
    "reconcile.completed",
    "file.discovered",
    "file.changed",
    "file.deleted",
    "root.skipped",
  ]);
});

test("public ingest provider registries cover only the supported parity set", () => {
  const claudeRoot: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claude",
    recursive: true,
  };
  const codexRoot: DiscoveryRootConfig = {
    provider: "codex",
    path: "/tmp/.codex",
    recursive: true,
  };

  const claudeRegistries = ingest.createClaudeIngestRegistries();
  const codexRegistries = ingest.createCodexIngestRegistries();

  expect(claudeRegistries).toHaveLength(2);
  expect(codexRegistries).toHaveLength(2);
  expect(claudeRegistries.map((registry) => registry.provider)).toEqual([
    "claude",
    "claude",
  ]);
  expect(codexRegistries.map((registry) => registry.provider)).toEqual([
    "codex",
    "codex",
  ]);

  const claudeSnapshotRegistry = claudeRegistries.find((registry) =>
    registry.matchFile("/tmp/claude/task.json", claudeRoot)?.kind === "snapshot"
  );
  const claudeTranscriptRegistry = claudeRegistries.find((registry) =>
    registry.matchFile("/tmp/claude/transcript.jsonl", claudeRoot)?.kind === "transcript"
  );
  const codexSessionIndexRegistry = codexRegistries.find((registry) =>
    registry.matchFile("/tmp/.codex/session_index.jsonl", codexRoot)?.kind === "session-index"
  );
  const codexTranscriptRegistry = codexRegistries.find((registry) =>
    registry.matchFile("/tmp/.codex/sessions/2026/03/15/rollout.jsonl", codexRoot)?.kind
      === "transcript"
  );

  expect(claudeSnapshotRegistry).toBeDefined();
  expect(claudeTranscriptRegistry).toBeDefined();
  expect(codexSessionIndexRegistry).toBeDefined();
  expect(codexTranscriptRegistry).toBeDefined();

  expect(claudeSnapshotRegistry?.matchFile("/tmp/claude/task.json", claudeRoot)).toEqual({
    kind: "snapshot",
  });
  expect(
    claudeSnapshotRegistry?.matchFile("/tmp/claude/transcript.jsonl", claudeRoot),
  ).toBeNull();
  expect(
    claudeTranscriptRegistry?.matchFile("/tmp/claude/transcript.jsonl", claudeRoot),
  ).toEqual({
    kind: "transcript",
  });
  expect(
    claudeTranscriptRegistry?.matchFile("/tmp/claude/task.json", claudeRoot),
  ).toBeNull();

  expect(
    codexSessionIndexRegistry?.matchFile("C:\\Users\\me\\.codex\\session-index.jsonl", codexRoot),
  ).toEqual({
    kind: "session-index",
  });
  expect(
    codexSessionIndexRegistry?.matchFile("C:\\Users\\me\\.codex\\session_index.jsonl", codexRoot),
  ).toEqual({
    kind: "session-index",
  });
  expect(
    codexTranscriptRegistry?.matchFile(
      "/tmp/.codex/sessions/2026/03/15/rollout-2026-03-15T09-29-00.jsonl",
      codexRoot,
    ),
  ).toEqual({
    kind: "transcript",
  });
  expect(
    codexTranscriptRegistry?.matchFile("/tmp/.codex/session-index.jsonl", codexRoot),
  ).toBeNull();
  expect(
    codexTranscriptRegistry?.matchFile("/tmp/.codex/session_index.jsonl", codexRoot),
  ).toBeNull();
  expect(codexTranscriptRegistry?.matchFile("/tmp/.codex/config.json", codexRoot)).toBeNull();
});

test("public ingest api types model the documented contract", () => {
  const root: DiscoveryRootConfig = {
    provider: "claude",
    path: "/tmp/claude",
    recursive: true,
    watch: true,
  };

  const cursorKey: IngestCursorKey = {
    provider: "claude",
    rootPath: root.path,
    filePath: "/tmp/claude/transcript.jsonl",
  };

  const cursor: IngestCursor = {
    ...cursorKey,
    byteOffset: 128,
    line: 3,
  };

  const discoveryPhase: DiscoveryPhase = "reconcile";
  const discoveryEventType: DiscoveryEventType = "root.skipped";
  const sourceKind: ObservedEventSourceKind = "snapshot";
  const eventCompleteness: ObservedEventCompleteness = "partial";
  const sessionState: ObservedSessionIdentityState = "canonical";
  const sessionReason: ObservedSessionReason = "reconcile";
  const warningCode: IngestWarningCode = "unsupported-record";
  const location: ObservedEventLocation = {
    line: cursor.line,
    byteOffset: cursor.byteOffset,
  };
  const source: ObservedEventSource = {
    provider: "claude",
    kind: sourceKind,
    discoveryPhase,
    rootPath: root.path,
    filePath: "/tmp/claude/task.json",
    location,
    metadata: {
      artifact: "snapshot-task",
    },
  };
  const fileMatch: IngestFileMatch = {
    kind: sourceKind,
    metadata: {
      artifact: "snapshot-task",
    },
  };

  const observedSession: ObservedSessionIdentity = {
    provider: "claude",
    sessionId: "session-observed-001",
    state: sessionState,
  };

  const observedEvent: ObservedAgentEvent = {
    kind: "event",
    event: {
      type: "message.completed",
      provider: "claude",
      session: {
        provider: "claude",
        sessionId: "session-observed-001",
      },
      role: "assistant",
      text: "ingested",
    },
    source,
    observedSession,
    completeness: eventCompleteness,
    cursor,
  };

  const observedSessionRecord: ObservedSessionRecord = {
    kind: "session",
    observedSession,
    source,
    completeness: "best-effort",
    reason: sessionReason,
  };

  const parseContext: IngestParseContext = {
    root: {
      provider: "claude",
      path: root.path,
    },
    filePath: source.filePath,
    discoveryPhase,
    cursor,
    match: fileMatch,
  };

  const warning: IngestWarning = {
    code: warningCode,
    message: "Snapshot/task payload did not contain any Claude artifact records.",
    provider: "claude",
    filePath: source.filePath,
    source,
  };

  const discoveryEvent: DiscoveryEvent = {
    type: discoveryEventType,
    provider: "claude",
    rootPath: root.path,
    discoveryPhase,
    detail: "root was intentionally skipped",
    raw: {
      duplicateOf: "/tmp/claude-duplicate",
    },
  };

  const cursorStore = ingest.createInMemoryCursorStore([cursor]) as CursorStore;

  const records: ObservedIngestRecord[] = [observedEvent, observedSessionRecord];

  const registry: IngestProviderRegistry = {
    provider: "claude",
    matchFile(filePath) {
      return filePath.endsWith(".json") ? fileMatch : null;
    },
    async *parseFile() {
      yield observedEvent;
      yield observedSessionRecord;
    },
  };

  const options: SessionIngestServiceOptions = {
    roots: [root],
    registries: [registry],
    cursorStore,
    watchIntervalMs: 50,
    onRecord() {},
    onObservedEvent() {},
    onObservedSession() {},
    onWarning() {},
    onDiscoveryEvent() {},
  };

  const service = ingest.createSessionIngestService(options) as SessionIngestService;

  expect(observedEvent.observedSession).toEqual(observedSession);
  expect(observedSessionRecord.reason).toBe(sessionReason);
  expect(records).toHaveLength(2);
  expect(registry.matchFile(parseContext.filePath, parseContext.root)).toEqual(fileMatch);
  expect(warning.code).toBe(warningCode);
  expect(discoveryEvent.type).toBe(discoveryEventType);
  expect(service.roots).toEqual([root]);
  expect(typeof service.reconcileNow).toBe("function");
});
