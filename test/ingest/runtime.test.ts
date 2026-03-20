import { afterEach, expect, test } from "bun:test";
import { rm, stat, utimes } from "node:fs/promises";
import { basename, join } from "node:path";

import type {
  DiscoveryEvent,
  IngestCursor,
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionRecord,
} from "@jasonbelmonti/claudex/ingest";
import {
  createClaudeIngestRegistries,
  createCodexIngestRegistries,
  createInMemoryCursorStore,
  createSessionIngestService,
} from "@jasonbelmonti/claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createObservedSessionRecord,
  createRegistry,
  removeFixtureWorkspace,
  rotateFile,
  truncateFile,
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

test("scanNow integrates Codex bootstrap and transcript registries with canonical session refinement", async () => {
  const sessionId = "019cbbf0-9d22-72c2-982c-8ac623e7998f";
  const transcriptFileName = `rollout-2026-03-15T09-29-00-${sessionId}.jsonl`;
  const workspace = await createFixtureWorkspace({
    ".codex/session_index.jsonl": `${JSON.stringify({
      id: sessionId,
      thread_name: "BEL-391 runtime coverage",
      updated_at: "2026-03-15T14:29:00.000Z",
    })}\n`,
    [join(".codex", "sessions", "2026", "03", "15", transcriptFileName)]: [
      JSON.stringify({
        timestamp: "2026-03-15T14:29:00.000Z",
        type: "session_meta",
        payload: {
          id: sessionId,
          cwd: "/Users/jasonbelmonti/Documents/Development/claudex",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:01.000Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn-bel-391",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Integrate Codex registries",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:03.000Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Bootstrap session upgraded.",
          phase: "final_answer",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:04.000Z",
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: "turn-bel-391",
          last_agent_message: "Bootstrap session upgraded.",
        },
      }),
      "",
    ].join("\n"),
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, ".codex"),
    recursive: true,
  };
  const bootstrapFilePath = join(workspace, ".codex", "session_index.jsonl");
  const transcriptFilePath = join(
    workspace,
    ".codex",
    "sessions",
    "2026",
    "03",
    "15",
    transcriptFileName,
  );

  const discoveryEvents: DiscoveryEvent[] = [];
  const records: string[] = [];
  const observedEvents: ObservedAgentEvent[] = [];
  const observedSessions: ObservedSessionRecord[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: createCodexIngestRegistries(),
    onRecord(record) {
      const state = record.observedSession?.state ?? "none";
      const session = record.observedSession?.sessionId ?? "none";
      records.push(
        `${record.kind}:${record.source.kind}:${record.source.filePath}:${session}:${state}`,
      );
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

  expect(
    discoveryEvents
      .filter((event) => event.type === "file.discovered")
      .map((event) => event.filePath),
  ).toEqual([bootstrapFilePath, transcriptFilePath]);
  expect(observedSessions.map((record) => ({
    sessionId: record.observedSession.sessionId,
    state: record.observedSession.state,
    reason: record.reason,
    kind: record.source.kind,
    filePath: record.source.filePath,
  }))).toEqual([
    {
      sessionId,
      state: "provisional",
      reason: "index",
      kind: "session-index",
      filePath: bootstrapFilePath,
    },
    {
      sessionId,
      state: "canonical",
      reason: "transcript",
      kind: "transcript",
      filePath: transcriptFilePath,
    },
  ]);
  expect(observedEvents.map((record) => ({
    type: record.event.type,
    sessionId: record.observedSession?.sessionId,
    state: record.observedSession?.state,
    filePath: record.source.filePath,
  }))).toEqual([
    {
      type: "session.started",
      sessionId,
      state: "canonical",
      filePath: transcriptFilePath,
    },
    {
      type: "turn.started",
      sessionId,
      state: "canonical",
      filePath: transcriptFilePath,
    },
    {
      type: "message.completed",
      sessionId,
      state: "canonical",
      filePath: transcriptFilePath,
    },
    {
      type: "turn.completed",
      sessionId,
      state: "canonical",
      filePath: transcriptFilePath,
    },
  ]);
  expect(records).toEqual([
    `session:session-index:${bootstrapFilePath}:${sessionId}:provisional`,
    `event:transcript:${transcriptFilePath}:${sessionId}:canonical`,
    `event:transcript:${transcriptFilePath}:${sessionId}:canonical`,
    `event:transcript:${transcriptFilePath}:${sessionId}:canonical`,
    `event:transcript:${transcriptFilePath}:${sessionId}:canonical`,
    `session:transcript:${transcriptFilePath}:${sessionId}:canonical`,
  ]);
});

test("scanNow integrates Claude transcript and snapshot registries across the supported parity set", async () => {
  const transcriptFixture = await Bun.file(
    new URL("../fixtures/claude/transcript.jsonl", import.meta.url),
  ).text();
  const snapshotFixture = await Bun.file(
    new URL("../fixtures/claude/snapshot-task.json", import.meta.url),
  ).text();
  const workspace = await createFixtureWorkspace({
    "claude/a-snapshot.json": snapshotFixture,
    "claude/b-transcript.jsonl": transcriptFixture,
    "claude/ignore.txt": "skip\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    recursive: true,
    metadata: { lane: "parity" },
  };
  const snapshotFilePath = join(workspace, "claude", "a-snapshot.json");
  const transcriptFilePath = join(workspace, "claude", "b-transcript.jsonl");

  const discoveryEvents: DiscoveryEvent[] = [];
  const warnings: IngestWarning[] = [];
  const observedEvents: ObservedAgentEvent[] = [];
  const observedSessions: ObservedSessionRecord[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: createClaudeIngestRegistries(),
    onObservedEvent(record) {
      observedEvents.push(record);
    },
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.scanNow();

  expect(
    discoveryEvents
      .filter((event) => event.type === "file.discovered")
      .map((event) => event.filePath),
  ).toEqual([snapshotFilePath, transcriptFilePath]);
  expect(observedEvents.map((record) => ({
    kind: record.source.kind,
    type: record.event.type,
    filePath: record.source.filePath,
    discoveryPhase: record.source.discoveryPhase,
    state: record.observedSession?.state,
  }))).toEqual([
    {
      kind: "snapshot",
      type: "message.completed",
      filePath: snapshotFilePath,
      discoveryPhase: "initial_scan",
      state: "canonical",
    },
    {
      kind: "snapshot",
      type: "message.delta",
      filePath: snapshotFilePath,
      discoveryPhase: "initial_scan",
      state: "canonical",
    },
    {
      kind: "transcript",
      type: "message.completed",
      filePath: transcriptFilePath,
      discoveryPhase: "initial_scan",
      state: "canonical",
    },
    {
      kind: "transcript",
      type: "message.delta",
      filePath: transcriptFilePath,
      discoveryPhase: "initial_scan",
      state: undefined,
    },
    {
      kind: "transcript",
      type: "turn.completed",
      filePath: transcriptFilePath,
      discoveryPhase: "initial_scan",
      state: "canonical",
    },
  ]);
  expect(observedSessions.map((record) => ({
    reason: record.reason,
    kind: record.source.kind,
    state: record.observedSession.state,
    filePath: record.source.filePath,
  }))).toEqual([
    {
      reason: "snapshot",
      kind: "snapshot",
      state: "provisional",
      filePath: snapshotFilePath,
    },
    {
      reason: "transcript",
      kind: "transcript",
      state: "provisional",
      filePath: transcriptFilePath,
    },
  ]);
  expect(warnings.map((warning) => ({
    code: warning.code,
    kind: warning.source?.kind,
    filePath: warning.filePath,
  }))).toEqual([
    {
      code: "unsupported-record",
      kind: "snapshot",
      filePath: snapshotFilePath,
    },
    {
      code: "parse-failed",
      kind: "transcript",
      filePath: transcriptFilePath,
    },
  ]);
  expect([...observedEvents, ...observedSessions].every((record) =>
    record.source.metadata?.lane === "parity"
    && record.cursor?.provider === "claude"
    && record.cursor.rootPath === root.path
    && record.cursor.filePath === record.source.filePath
    && typeof record.cursor.byteOffset === "number"
    && record.cursor.byteOffset > 0
  )).toBe(true);
});

test("scanNow does not re-emit the canonical Codex transcript session for event-only appends", async () => {
  const sessionId = "019cbbf0-9d22-72c2-982c-8ac623e7998f";
  const transcriptRelativePath = join(
    ".codex",
    "sessions",
    "2026",
    "03",
    "15",
    `rollout-2026-03-15T09-29-00-${sessionId}.jsonl`,
  );
  const workspace = await createFixtureWorkspace({
    ".codex/session_index.jsonl": `${JSON.stringify({
      id: sessionId,
      thread_name: "BEL-391 append regression",
      updated_at: "2026-03-15T14:29:00.000Z",
    })}\n`,
    [transcriptRelativePath]: [
      JSON.stringify({
        timestamp: "2026-03-15T14:29:00.000Z",
        type: "session_meta",
        payload: {
          id: sessionId,
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:01.000Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn-bel-391",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Integrate Codex registries",
        },
      }),
      "",
    ].join("\n"),
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, ".codex"),
    recursive: true,
  };
  const transcriptFilePath = join(workspace, transcriptRelativePath);
  const observedSessions: ObservedSessionRecord[] = [];
  const observedEvents: ObservedAgentEvent[] = [];
  const cursorStore = createInMemoryCursorStore();

  const service = createSessionIngestService({
    roots: [root],
    registries: createCodexIngestRegistries(),
    cursorStore,
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onObservedEvent(record) {
      observedEvents.push(record);
    },
  });

  await service.scanNow();

  await Bun.write(
    transcriptFilePath,
    [
      JSON.stringify({
        timestamp: "2026-03-15T14:29:00.000Z",
        type: "session_meta",
        payload: {
          id: sessionId,
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:01.000Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn-bel-391",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Integrate Codex registries",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:03.000Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Bootstrap session upgraded.",
          phase: "final_answer",
        },
      }),
      "",
    ].join("\n"),
  );

  await service.scanNow();

  expect(observedSessions.map((record) => ({
    sessionId: record.observedSession.sessionId,
    state: record.observedSession.state,
    reason: record.reason,
  }))).toEqual([
    {
      sessionId,
      state: "provisional",
      reason: "index",
    },
    {
      sessionId,
      state: "canonical",
      reason: "transcript",
    },
  ]);
  expect(
    observedEvents.filter((record) => record.source.filePath === transcriptFilePath).map((record) => record.event.type),
  ).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
  ]);
});

test("reconcileNow does not re-emit unchanged Codex bootstrap and transcript files when only mtimes change", async () => {
  const sessionId = "019cbbf0-9d22-72c2-982c-8ac623e7998f";
  const transcriptRelativePath = join(
    ".codex",
    "sessions",
    "2026",
    "03",
    "15",
    `rollout-2026-03-15T09-29-00-${sessionId}.jsonl`,
  );
  const workspace = await createFixtureWorkspace({
    ".codex/session_index.jsonl": `${JSON.stringify({
      id: sessionId,
      thread_name: "BEL-392 reconcile coverage",
      updated_at: "2026-03-15T14:29:00.000Z",
    })}\n`,
    [transcriptRelativePath]: [
      JSON.stringify({
        timestamp: "2026-03-15T14:29:00.000Z",
        type: "session_meta",
        payload: {
          id: sessionId,
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:01.000Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn-bel-392",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Verify reconcile touch behavior",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:03.000Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: "Reconcile should stay quiet.",
          phase: "final_answer",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:04.000Z",
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: "turn-bel-392",
          last_agent_message: "Reconcile should stay quiet.",
        },
      }),
      "",
    ].join("\n"),
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, ".codex"),
    recursive: true,
  };
  const bootstrapFilePath = join(workspace, ".codex", "session_index.jsonl");
  const transcriptFilePath = join(workspace, transcriptRelativePath);
  const discoveryEvents: DiscoveryEvent[] = [];
  const observedSessions: string[] = [];
  const observedEvents: string[] = [];
  const cursorStore = createInMemoryCursorStore();

  const service = createSessionIngestService({
    roots: [root],
    registries: createCodexIngestRegistries(),
    cursorStore,
    onObservedSession(record) {
      observedSessions.push(`${record.reason}:${record.source.filePath}`);
    },
    onObservedEvent(record) {
      observedEvents.push(`${record.event.type}:${record.source.filePath}`);
    },
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.scanNow();

  observedSessions.length = 0;
  observedEvents.length = 0;
  discoveryEvents.length = 0;

  const bootstrapStats = await stat(bootstrapFilePath);
  await utimes(
    bootstrapFilePath,
    bootstrapStats.atime,
    new Date(bootstrapStats.mtimeMs + 10_000),
  );
  const transcriptStats = await stat(transcriptFilePath);
  await utimes(
    transcriptFilePath,
    transcriptStats.atime,
    new Date(transcriptStats.mtimeMs + 10_000),
  );

  await service.reconcileNow();

  expect(
    discoveryEvents.map((event) => `${event.type}:${event.filePath ?? event.rootPath}`),
  ).toEqual([
    `reconcile.started:${root.path}`,
    `file.changed:${bootstrapFilePath}`,
    `file.changed:${transcriptFilePath}`,
    `reconcile.completed:${root.path}`,
  ]);
  expect(observedSessions).toEqual([]);
  expect(observedEvents).toEqual([]);
});

test("scanNow orders discovered files with locale-independent name comparison", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/ä-after-z.jsonl": "{\"ok\":true}\n",
    "claude/z-middle.jsonl": "{\"ok\":true}\n",
    "claude/a-first.jsonl": "{\"ok\":true}\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    recursive: true,
  };
  const parseCalls: string[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        parseCalls,
        recordFactory(context) {
          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.filePath}`,
            }),
          ];
        },
      }),
    ],
  });

  await service.scanNow();

  expect(parseCalls.map((filePath) => basename(filePath).normalize("NFC"))).toEqual([
    "a-first.jsonl",
    "z-middle.jsonl",
    "ä-after-z.jsonl",
  ]);
});

test("scanNow persists the latest cursor, skips unchanged files, and emits record warnings", async () => {
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
    byteOffset: 12,
    line: 1,
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

  expect((storedCursor as IngestCursor).fingerprint).toBeDefined();
  expect((storedCursor as IngestCursor).byteOffset).toBe(expectedCursor.byteOffset);
  expect(parseCursors).toEqual([null]);
  expect(warnings).toEqual([expectedWarning]);
});

test("reconcileNow keeps independent snapshots for roots with the same path but different semantics", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/alpha.jsonl": "{\"ok\":true}\n",
    "claude/beta.jsonl": "{\"ok\":true}\n",
  });
  workspaces.push(workspace);

  const rootPath = join(workspace, "claude");
  const alphaRoot = {
    provider: "claude" as const,
    path: rootPath,
    include: ["alpha.jsonl"],
    metadata: { lane: "alpha" },
  };
  const betaRoot = {
    provider: "claude" as const,
    path: rootPath,
    include: ["beta.jsonl"],
    metadata: { lane: "beta" },
  };

  const alphaFilePath = join(rootPath, "alpha.jsonl");
  const betaFilePath = join(rootPath, "beta.jsonl");
  const parseCalls: string[] = [];
  const discoveryEvents: DiscoveryEvent[] = [];
  const deletedCursorKeys: string[] = [];

  const service = createSessionIngestService({
    roots: [alphaRoot, betaRoot],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        parseCalls,
        recordFactory(context) {
          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.root.metadata?.lane}:${context.filePath}`,
              discoveryPhase: context.discoveryPhase,
              cursor: {
                provider: "claude",
                rootPath: context.root.path,
                filePath: context.filePath,
                byteOffset: Number(Bun.file(context.filePath).size),
                line: 1,
              },
            }),
          ];
        },
      }),
    ],
    cursorStore: {
      async get() {
        return null;
      },
      async set() {},
      async delete(cursorKey) {
        deletedCursorKeys.push(`${cursorKey.rootPath}:${cursorKey.filePath}`);
      },
    },
    onDiscoveryEvent(event) {
      discoveryEvents.push(event);
    },
  });

  await service.scanNow();
  await service.reconcileNow();

  expect(parseCalls).toEqual([alphaFilePath, betaFilePath]);
  expect(
    discoveryEvents.filter((event) => event.type === "file.deleted"),
  ).toHaveLength(0);
  expect(
    discoveryEvents.filter((event) => event.type === "file.discovered").map((event) => event.filePath),
  ).toEqual([alphaFilePath, betaFilePath]);
  expect(deletedCursorKeys).toEqual([]);
});

test("scanNow does not replay EOF cursors when files are only touched", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/touched.jsonl": "{\"ok\":true}\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(workspace, "claude", "touched.jsonl");
  const parseCursors: (IngestCursor | null)[] = [];
  let storedCursor: IngestCursor | null = null;

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
              sessionId: "session-touched",
              cursor: {
                provider: "claude",
                rootPath: root.path,
                filePath: context.filePath,
                byteOffset: Number(Bun.file(context.filePath).size),
                line: 1,
              },
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
      async delete() {
        storedCursor = null;
      },
    },
  });

  await service.scanNow();

  const currentStats = await stat(filePath);
  await utimes(filePath, currentStats.atime, new Date(currentStats.mtimeMs + 10_000));

  await service.scanNow();

  const persistedCursor = storedCursor;

  if (!persistedCursor) {
    throw new Error("Expected touched-file scan to preserve the stored cursor");
  }

  const persistedByteOffset = (persistedCursor as IngestCursor).byteOffset;

  expect(parseCursors).toEqual([null]);
  expect(persistedByteOffset).toBe(Number(Bun.file(filePath).size));
});

test("scanNow advances the cursor when an active file appends during parsing", async () => {
  const initialContents = "abcdef\n";
  const appendedContents = "ghijk\n";
  const initialCursorByteOffset = 3;
  const workspace = await createFixtureWorkspace({
    "claude/active-progress.jsonl": initialContents,
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(workspace, "claude", "active-progress.jsonl");

  let nextByteOffset = initialCursorByteOffset;
  let appendBeforeParse = false;
  const parseCursors: (IngestCursor | null)[] = [];
  const warnings: IngestWarning[] = [];
  let storedCursor: IngestCursor | null = null;
  const readStoredCursor = (): IngestCursor | null => storedCursor;

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        async beforeParse(context) {
          if (!appendBeforeParse) {
            return;
          }

          appendBeforeParse = false;
          await Bun.write(context.filePath, `${initialContents}${appendedContents}`);
        },
        recordFactory(context) {
          parseCursors.push(context.cursor);

          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-active-progress",
              cursor: {
                provider: "claude",
                rootPath: root.path,
                filePath: context.filePath,
                byteOffset: nextByteOffset,
                line: 1,
              },
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
      async delete() {
        storedCursor = null;
      },
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  nextByteOffset = initialContents.length + appendedContents.length;
  appendBeforeParse = true;
  await service.scanNow();
  await service.scanNow();

  const persistedCursor = readStoredCursor();

  if (!persistedCursor) {
    throw new Error("Expected scanNow() to persist appended progress");
  }

  expect(parseCursors.map((cursor) => cursor?.byteOffset ?? null)).toEqual([null, initialCursorByteOffset]);
  expect(persistedCursor.filePath).toBe(filePath);
  expect(persistedCursor.byteOffset).toBe(initialContents.length + appendedContents.length);
  expect(warnings).toEqual([]);
});

test("scanNow resets the cursor and reprocesses truncated files", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/truncate.jsonl": "abcdef\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(workspace, "claude", "truncate.jsonl");

  let nextByteOffset = 7;
  const parseCursors: (IngestCursor | null)[] = [];
  const warnings: IngestWarning[] = [];
  let storedCursor: IngestCursor | null = null;

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
              sessionId: "session-truncate",
              cursor: {
                provider: "claude",
                rootPath: root.path,
                filePath: context.filePath,
                byteOffset: nextByteOffset,
                line: 1,
              },
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
  nextByteOffset = 1;
  await truncateFile(filePath, 1);
  await service.scanNow();

  expect(parseCursors).toEqual([null, null]);
  expect(warnings.map((warning) => warning.code)).toEqual(["truncated-file"]);
});

test("scanNow clears stale cursors after truncation when reprocessing yields no new cursor", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/truncate-empty.jsonl": "abcdef\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(workspace, "claude", "truncate-empty.jsonl");

  const parseCursors: (IngestCursor | null)[] = [];
  const warnings: IngestWarning[] = [];
  let storedCursor: IngestCursor | null = null;
  let emitCursor = true;

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        recordFactory(context) {
          parseCursors.push(context.cursor);

          if (!emitCursor) {
            return [];
          }

          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: "session-truncate-empty",
              cursor: {
                provider: "claude",
                rootPath: root.path,
                filePath: context.filePath,
                byteOffset: 7,
                line: 1,
              },
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
      async delete() {
        storedCursor = null;
      },
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();
  emitCursor = false;
  await truncateFile(filePath, 1);
  await service.scanNow();
  await service.scanNow();

  expect(storedCursor).toBeNull();
  expect(parseCursors).toEqual([null, null, null]);
  expect(warnings.map((warning) => warning.code)).toEqual(["truncated-file"]);
});

test("scanNow resets the cursor and reprocesses rotated files", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/rotate.jsonl": "abcdef\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(workspace, "claude", "rotate.jsonl");

  let nextByteOffset = 7;
  const parseCursors: (IngestCursor | null)[] = [];
  const warnings: IngestWarning[] = [];
  let storedCursor: IngestCursor | null = null;

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
              sessionId: "session-rotate",
              cursor: {
                provider: "claude",
                rootPath: root.path,
                filePath: context.filePath,
                byteOffset: nextByteOffset,
                line: 1,
              },
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
  nextByteOffset = 3;
  await rotateFile(filePath, "xy\n");
  await service.scanNow();

  expect(parseCursors).toEqual([null, null]);
  expect(warnings.map((warning) => warning.code)).toEqual(["rotated-file"]);
});

test("scanNow emits parse-failed warnings and continues processing other files", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/a-bad.jsonl": "bad\n",
    "claude/b-good.jsonl": "good\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const records: string[] = [];
  const warnings: IngestWarning[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        errorFactory(context) {
          return context.filePath.endsWith("a-bad.jsonl")
            ? new Error("bad parse")
            : null;
        },
        recordFactory(context) {
          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.filePath}`,
            }),
          ];
        },
      }),
    ],
    onRecord(record) {
      records.push(record.source.filePath);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(records).toEqual([join(workspace, "claude", "b-good.jsonl")]);
  expect(warnings.map((warning) => warning.code)).toEqual(["parse-failed"]);
});

test("scanNow emits parse-failed warnings when parseFile throws before iteration starts", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/a-bad.jsonl": "bad\n",
    "claude/b-good.jsonl": "good\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const records: string[] = [];
  const warnings: IngestWarning[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      {
        provider: "claude",
        matchFile(filePath) {
          return filePath.endsWith(".jsonl") ? { kind: "transcript" as const } : null;
        },
        parseFile(context) {
          if (context.filePath.endsWith("a-bad.jsonl")) {
            throw new Error("failed before iteration");
          }

          return (async function* (): AsyncIterable<ObservedAgentEvent | ObservedSessionRecord> {
            yield createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.filePath}`,
            });
          })();
        },
      },
    ],
    onRecord(record) {
      records.push(record.source.filePath);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(records).toEqual([join(workspace, "claude", "b-good.jsonl")]);
  expect(warnings.map((warning) => warning.code)).toEqual(["parse-failed"]);
});

test("scanNow persists the latest cursor when parsing fails after emitting earlier records", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/partial-failure.jsonl": "abcdef\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const filePath = join(workspace, "claude", "partial-failure.jsonl");

  const parseCursors: (IngestCursor | null)[] = [];
  const warnings: IngestWarning[] = [];
  let storedCursor: IngestCursor | null = null;
  const readStoredCursor = (): IngestCursor | null => storedCursor;

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      {
        provider: "claude",
        matchFile(candidatePath) {
          return candidatePath.endsWith(".jsonl") ? { kind: "transcript" as const } : null;
        },
        async *parseFile(context) {
          parseCursors.push(context.cursor);

          yield createObservedEventRecord({
            provider: "claude",
            filePath: context.filePath,
            root: context.root,
            sessionId: "session-partial-failure",
            cursor: {
              provider: "claude",
              rootPath: root.path,
              filePath: context.filePath,
              byteOffset: 7,
              line: 1,
            },
          });

          throw new Error("trailing parse failure");
        },
      },
    ],
    cursorStore: {
      async get() {
        return storedCursor;
      },
      async set(cursor) {
        storedCursor = cursor;
      },
      async delete() {
        storedCursor = null;
      },
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();
  await service.scanNow();

  const persistedCursor = readStoredCursor();

  if (!persistedCursor) {
    throw new Error("Expected scanNow() to persist the latest cursor after a partial parse failure");
  }

  expect(persistedCursor.filePath).toBe(filePath);
  expect(persistedCursor.byteOffset).toBe(7);
  expect(parseCursors).toEqual([null]);
  expect(warnings.map((warning) => warning.code)).toEqual(["parse-failed"]);
});

test("scanNow emits file-open-failed warnings and continues processing other files", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/a-first.jsonl": "first\n",
    "claude/b-vanish.jsonl": "vanish\n",
    "claude/c-good.jsonl": "good\n",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const records: string[] = [];
  const warnings: IngestWarning[] = [];
  const vanishingFilePath = join(workspace, "claude", "b-vanish.jsonl");

  const service = createSessionIngestService({
    roots: [root],
    registries: [
      createRegistry({
        provider: "claude",
        matchExtension: ".jsonl",
        async beforeParse(context) {
          if (context.filePath.endsWith("a-first.jsonl")) {
            await rotateFile(vanishingFilePath, "gone\n");
            await rm(`${vanishingFilePath}.rotated`, { force: true });
            await rm(vanishingFilePath, { force: true });
          }
        },
        recordFactory(context) {
          return [
            createObservedEventRecord({
              provider: "claude",
              filePath: context.filePath,
              root: context.root,
              sessionId: `session:${context.filePath}`,
            }),
          ];
        },
      }),
    ],
    onRecord(record) {
      records.push(record.source.filePath);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(records).toEqual([
    join(workspace, "claude", "a-first.jsonl"),
    join(workspace, "claude", "c-good.jsonl"),
  ]);
  expect(warnings.map((warning) => warning.code)).toEqual(["file-open-failed"]);
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
