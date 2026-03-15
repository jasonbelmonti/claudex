import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  IngestCursor,
  IngestWarning,
  ObservedSessionRecord,
} from "claudex/ingest";
import {
  createInMemoryCursorStore,
  createSessionIngestService,
} from "claudex/ingest";
import { createCodexSessionIndexIngestRegistry } from "../../src/ingest/codex";
import {
  createFixtureWorkspace,
  removeFixtureWorkspace,
} from "./helpers";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)));
});

test("session-index parser emits provisional observed sessions from a representative bootstrap fixture", async () => {
  const fixture = await Bun.file(new URL("../fixtures/codex/session-index.jsonl", import.meta.url)).text();
  const workspace = await createFixtureWorkspace({
    "codex/session_index.jsonl": fixture,
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
    metadata: { lane: "bootstrap" },
  };

  const observedSessions: ObservedSessionRecord[] = [];
  const warningCodes: string[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [createCodexSessionIndexIngestRegistry()],
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onWarning(warning) {
      warningCodes.push(warning.code);
    },
  });

  await service.scanNow();

  expect(observedSessions).toHaveLength(2);
  expect(observedSessions.map((record) => record.observedSession)).toEqual([
    {
      provider: "codex",
      sessionId: "thread-bootstrap-1",
      state: "provisional",
      metadata: {
        threadName: "Bootstrap parser coverage",
        updatedAt: "2026-03-13T18:22:00.000000Z",
      },
    },
    {
      provider: "codex",
      sessionId: "thread-bootstrap-2",
      state: "provisional",
      metadata: {
        threadName: "Refine observed session identity",
        updatedAt: "2026-03-13T19:04:11.245000Z",
      },
    },
  ]);
  expect(observedSessions.map((record) => record.reason)).toEqual([
    "index",
    "index",
  ]);
  expect(observedSessions[0]?.source.kind).toBe("session-index");
  expect(observedSessions[0]?.source.metadata).toEqual({ lane: "bootstrap" });
  expect(warningCodes).toEqual([]);
});

test("session-index parser emits warnings for malformed or partial lines without crashing ingest", async () => {
  const partialFixture = [
    JSON.stringify({
      id: "thread-partial-1",
      updated_at: "2026-03-13T21:11:30.000000Z",
    }),
    JSON.stringify({
      thread_name: "missing id",
      updated_at: "2026-03-13T21:14:10.000000Z",
    }),
    JSON.stringify({
      id: "thread-partial-3",
      thread_name: "invalid timestamp",
      updated_at: "not-a-timestamp",
    }),
    "{ bad json",
  ].join("\n");
  const workspace = await createFixtureWorkspace({
    "codex/session_index.jsonl": partialFixture,
  });
  workspaces.push(workspace);

  const filePath = join(workspace, "codex", "session_index.jsonl");
  const observedSessions: ObservedSessionRecord[] = [];
  const warnings: IngestWarning[] = [];
  const root = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
  };

  const service = createSessionIngestService({
    roots: [root],
    registries: [createCodexSessionIndexIngestRegistry()],
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(observedSessions.map((record) => ({
    sessionId: record.observedSession.sessionId,
    metadata: record.observedSession.metadata,
    completeness: record.completeness,
  }))).toEqual([
    {
      sessionId: "thread-partial-1",
      metadata: {
        updatedAt: "2026-03-13T21:11:30.000000Z",
      },
      completeness: "partial",
    },
    {
      sessionId: `file:${filePath}:line:2`,
      metadata: {
        threadName: "missing id",
        updatedAt: "2026-03-13T21:14:10.000000Z",
      },
      completeness: "partial",
    },
    {
      sessionId: "thread-partial-3",
      metadata: {
        threadName: "invalid timestamp",
      },
      completeness: "partial",
    },
    {
      sessionId: `file:${filePath}:line:4`,
      metadata: undefined,
      completeness: "partial",
    },
  ]);
  expect(warnings.map((warning) => warning.code)).toEqual([
    "unsupported-record",
    "unsupported-record",
    "unsupported-record",
    "parse-failed",
  ]);
  expect(warnings[0]).toMatchObject({
    provider: "codex",
    filePath,
    source: {
      provider: "codex",
      kind: "session-index",
      filePath,
    },
  });
});

test("session-index registry matches both hyphenated and underscored filenames across path styles", () => {
  const registry = createCodexSessionIndexIngestRegistry();
  const root = {
    provider: "codex" as const,
    path: "/repo/codex",
  };

  expect(
    registry.matchFile("/repo/codex/session-index.jsonl", root),
  ).toEqual({ kind: "session-index" });
  expect(
    registry.matchFile("/repo/codex/session_index.jsonl", root),
  ).toEqual({ kind: "session-index" });
  expect(
    registry.matchFile("C:\\repo\\codex\\session-index.jsonl", root),
  ).toEqual({ kind: "session-index" });
  expect(
    registry.matchFile("C:\\repo\\codex\\session_index.jsonl", root),
  ).toEqual({ kind: "session-index" });
});

test("session-index parser persists an EOF cursor for trailing blank lines", async () => {
  const transcript = [
    JSON.stringify({
      id: "thread-bootstrap-1",
      thread_name: "Bootstrap parser coverage",
      updated_at: "2026-03-13T18:22:00.000000Z",
    }),
    "",
    "",
  ].join("\n");
  const workspace = await createFixtureWorkspace({
    "codex/session-index.jsonl": transcript,
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
  };
  const filePath = join(workspace, "codex", "session-index.jsonl");
  const cursorKey = {
    provider: "codex" as const,
    rootPath: root.path,
    filePath,
  };
  const observedSessions: string[] = [];
  const parseCursors: (IngestCursor | null)[] = [];
  const baseRegistry = createCodexSessionIndexIngestRegistry();
  const cursorStore = createInMemoryCursorStore();

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      {
        ...baseRegistry,
        async *parseFile(context) {
          parseCursors.push(context.cursor);
          const records = await baseRegistry.parseFile(context);
          yield* records;
        },
      },
    ],
    cursorStore,
    onObservedSession(record) {
      observedSessions.push(record.observedSession.sessionId);
    },
  });

  await service.scanNow();

  const persistedCursor = await cursorStore.get(cursorKey);

  expect(persistedCursor).toMatchObject({
    provider: "codex",
    rootPath: root.path,
    filePath,
    byteOffset: transcript.length,
    line: 3,
  });
  expect(observedSessions).toEqual(["thread-bootstrap-1"]);

  await service.reconcileNow();

  expect(parseCursors).toEqual([null]);
});
