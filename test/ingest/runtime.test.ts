import { afterEach, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { basename, join } from "node:path";

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
