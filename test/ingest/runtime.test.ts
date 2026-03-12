import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  DiscoveryEvent,
  IngestCursor,
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionRecord,
} from "claudex/ingest";
import { createSessionIngestService } from "claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createObservedSessionRecord,
  createRegistry,
  removeFixtureWorkspace,
} from "./helpers";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)));
});

test("scanNow dispatches matched files in deterministic order and fans out record callbacks", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/z-last.jsonl": "{\"ok\":true}\n",
    "claude/a-first.jsonl": "{\"ok\":true}\n",
    "claude/ignore.txt": "skip\n",
    "codex/session-index.idx": "bootstrap\n",
  });
  workspaces.push(workspace);

  const claudeRoot = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    recursive: true,
  };
  const codexRoot = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
    recursive: true,
  };

  const parseCalls: string[] = [];
  const discoveryEvents: DiscoveryEvent[] = [];
  const records: string[] = [];
  const observedEvents: ObservedAgentEvent[] = [];
  const observedSessions: ObservedSessionRecord[] = [];

  const service = createSessionIngestService({
    roots: [claudeRoot, codexRoot],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        parseCalls,
        recordFactory(context) {
          return [
            createObservedSessionRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.filePath}`,
            }),
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.filePath}`,
            }),
          ];
        },
      }),
      createRegistry({
        provider: "codex",
        matchExtension: ".idx",
        parseCalls,
        recordFactory(context) {
          return [
            createObservedSessionRecord({
              provider: "codex",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.filePath}`,
            }),
          ];
        },
      }),
    ],
    onRecord(record) {
      records.push(`${record.kind}:${record.source.filePath}`);
    },
    onObservedEvent(record) {
      observedEvents.push(record);
    },
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.scanNow();

  expect(parseCalls).toEqual([
    join(workspace, "claude", "a-first.jsonl"),
    join(workspace, "claude", "z-last.jsonl"),
    join(workspace, "codex", "session-index.idx"),
  ]);
  expect(records).toEqual([
    `session:${join(workspace, "claude", "a-first.jsonl")}`,
    `event:${join(workspace, "claude", "a-first.jsonl")}`,
    `session:${join(workspace, "claude", "z-last.jsonl")}`,
    `event:${join(workspace, "claude", "z-last.jsonl")}`,
    `session:${join(workspace, "codex", "session-index.idx")}`,
  ]);
  expect(observedEvents).toHaveLength(2);
  expect(observedSessions).toHaveLength(3);
  expect(discoveryEvents.map((event) => `${event.type}:${event.filePath ?? event.rootPath}`)).toEqual([
    `scan.started:${claudeRoot.path}`,
    `file.discovered:${join(workspace, "claude", "a-first.jsonl")}`,
    `file.discovered:${join(workspace, "claude", "z-last.jsonl")}`,
    `scan.completed:${claudeRoot.path}`,
    `scan.started:${codexRoot.path}`,
    `file.discovered:${join(workspace, "codex", "session-index.idx")}`,
    `scan.completed:${codexRoot.path}`,
  ]);
});

test("scanNow persists the latest cursor and emits record warnings", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/progress.jsonl": "{\"ok\":true}\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(workspace, "claude", "progress.jsonl");
  const expectedCursor: IngestCursor = {
    provider: "claude",
    rootPath: root.path,
    filePath,
    byteOffset: 42,
    line: 2,
  };
  const expectedWarning: IngestWarning = {
    code: "parse-failed",
    message: "Recovered after a malformed line",
    provider: "claude",
    filePath,
  };

  let storedCursor: IngestCursor | null = null;
  const parseCursors: (IngestCursor | null)[] = [];
  const warnings: IngestWarning[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        recordFactory(context) {
          parseCursors.push(context.cursor);

          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-progress",
              cursor: expectedCursor,
              warnings: [expectedWarning],
            }),
          ];
        },
      }),
    ],
    cursorStore: {
      async get() {
        return storedCursor;
      },
      async set(cursor) {
        storedCursor = cursor;
      },
      async delete() {},
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();
  await service.scanNow();

  if (!storedCursor) {
    throw new Error("Expected scanNow() to persist the latest cursor");
  }

  expect(storedCursor as IngestCursor).toEqual(expectedCursor);
  expect(parseCursors).toEqual([null, expectedCursor]);
  expect(warnings).toEqual([expectedWarning, expectedWarning]);
});

test("scanNow emits root.skipped for missing roots and ignores unmatched files", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/ignore.txt": "skip\n",
  });
  workspaces.push(workspace);

  const discoveryEvents: DiscoveryEvent[] = [];
  const parseCalls: string[] = [];

  const service = createSessionIngestService({
    roots: [
      {
        provider: "claude",
        path: join(workspace, "missing"),
      },
      {
        provider: "claude",
        path: join(workspace, "claude"),
      },
    ],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        parseCalls,
        recordFactory() {
          return [];
        },
      }),
    ],
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.scanNow();

  expect(parseCalls).toEqual([]);
  expect(discoveryEvents).toEqual([
    {
      type: "scan.started",
      provider: "claude",
      rootPath: join(workspace, "missing"),
      discoveryPhase: "initial_scan",
    },
    {
      type: "root.skipped",
      provider: "claude",
      rootPath: join(workspace, "missing"),
      discoveryPhase: "initial_scan",
      detail: "Root path is missing or unreadable",
    },
    {
      type: "scan.started",
      provider: "claude",
      rootPath: join(workspace, "claude"),
      discoveryPhase: "initial_scan",
    },
    {
      type: "scan.completed",
      provider: "claude",
      rootPath: join(workspace, "claude"),
      discoveryPhase: "initial_scan",
    },
  ]);
});
