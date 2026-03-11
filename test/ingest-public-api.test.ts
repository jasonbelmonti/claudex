import { expect, test } from "bun:test";

import * as ingest from "claudex/ingest";

import type {
  CursorStore,
  DiscoveryEvent,
  DiscoveryRootConfig,
  IngestCursor,
  IngestCursorKey,
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionIdentity,
  SessionIngestService,
  SessionIngestServiceOptions,
} from "claudex/ingest";

test("public ingest api exports the documented runtime surface", () => {
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
  expect(ingest.INGEST_WARNING_CODES).toContain("parse-failed");
  expect(ingest.DISCOVERY_EVENT_TYPES).toContain("scan.completed");
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

  const observedSession: ObservedSessionIdentity = {
    provider: "claude",
    sessionId: "session-observed-001",
    state: "canonical",
  };

  const observedEvent: ObservedAgentEvent = {
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
    source: {
      provider: "claude",
      kind: "transcript",
      discoveryPhase: "initial_scan",
      rootPath: root.path,
      filePath: cursor.filePath,
    },
    observedSession,
    completeness: "best-effort",
    cursor,
  };

  const warning: IngestWarning = {
    code: "parse-failed",
    message: "Line 7 was invalid JSON",
    provider: "claude",
    filePath: cursor.filePath,
    source: observedEvent.source,
  };

  const discoveryEvent: DiscoveryEvent = {
    type: "scan.completed",
    provider: "claude",
    rootPath: root.path,
    discoveryPhase: "initial_scan",
  };

  const cursorStore: CursorStore = {
    async get(key) {
      return key.filePath === cursor.filePath ? cursor : null;
    },
    async set() {},
    async delete() {},
  };

  const options: SessionIngestServiceOptions = {
    roots: [root],
    cursorStore,
    onObservedEvent() {},
    onWarning() {},
    onDiscoveryEvent() {},
  };

  const service: SessionIngestService = {
    roots: options.roots,
    async start() {},
    async stop() {},
    async scanNow() {},
  };

  expect(observedEvent.observedSession).toEqual(observedSession);
  expect(warning.code).toBe("parse-failed");
  expect(discoveryEvent.type).toBe("scan.completed");
  expect(service.roots).toEqual([root]);
});
