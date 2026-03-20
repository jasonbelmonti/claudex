import { rm, stat, utimes } from "node:fs/promises";
import { expect, test } from "bun:test";
import { join } from "node:path";

import type { IngestCursor, IngestWarning } from "@jasonbelmonti/claudex/ingest";
import { createSessionIngestService } from "@jasonbelmonti/claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createRegistry,
  removeFixtureWorkspace,
  rotateFile,
  truncateFile,
} from "./helpers";

test("scanNow resets legacy cursors that do not have fingerprints", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/legacy.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(workspace, "claude", "legacy.jsonl");

    const parseCursors: (IngestCursor | null)[] = [];
    const warnings: IngestWarning[] = [];
    let storedCursor: IngestCursor | null = {
      provider: "claude",
      rootPath: root.path,
      filePath,
      byteOffset: 6,
      line: 1,
    };

    await rotateFile(filePath, "0123456789\n");

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
                sessionId: "session-legacy",
                cursor: {
                  provider: "claude",
                  rootPath: root.path,
                  filePath: context.filePath,
                  byteOffset: 11,
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

    expect(parseCursors).toEqual([null]);
    expect(warnings.map((warning) => warning.code)).toEqual(["cursor-reset"]);
    expect(storedCursor?.byteOffset).toBe(11);
    expect(storedCursor?.fingerprint).toBeDefined();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("scanNow resets cursors when same-inode rewrites change bytes before the cursor", async () => {
  const unchangedSuffix = "b".repeat(64);
  const initialContents = `${"a".repeat(16)}${unchangedSuffix}`;
  const rewrittenContents = `${"c".repeat(16)}${unchangedSuffix}`;
  const workspace = await createFixtureWorkspace({
    "claude/copytruncate.jsonl": initialContents,
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(workspace, "claude", "copytruncate.jsonl");

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
          recordFactory(context) {
            parseCursors.push(context.cursor);

            return [
              createObservedEventRecord({
                provider: "claude",
                filePath: context.filePath,
                root: context.root,
                sessionId: "session-copytruncate",
                cursor: {
                  provider: "claude",
                  rootPath: root.path,
                  filePath: context.filePath,
                  byteOffset: initialContents.length,
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
    await truncateFile(filePath, 0);
    await Bun.write(filePath, rewrittenContents);
    await service.scanNow();

    expect(parseCursors).toEqual([null, null]);
    expect(warnings.map((warning) => warning.code)).toEqual(["cursor-reset"]);
    const refreshedCursor = readStoredCursor();

    if (!refreshedCursor) {
      throw new Error("Expected copy-truncate recovery to persist a refreshed cursor");
    }

    expect(refreshedCursor.byteOffset).toBe(initialContents.length);
    expect(refreshedCursor.continuityToken).toBeDefined();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("scanNow does not persist stale fingerprints when files rotate during parsing", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/rotate-race.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const parseCursors: (IngestCursor | null)[] = [];
    const warnings: IngestWarning[] = [];
    let storedCursor: IngestCursor | null = null;
    const readStoredCursor = (): IngestCursor | null => storedCursor;
    let rotateBeforeParse = true;

    const service = createSessionIngestService({
      roots: [root],
      registries: [
        createRegistry({
          provider: "claude",
          matchExtension: ".jsonl",
          async beforeParse(context) {
            if (!rotateBeforeParse) {
              return;
            }

            rotateBeforeParse = false;
            await rotateFile(context.filePath, "0123456789\n");
          },
          recordFactory(context) {
            parseCursors.push(context.cursor);

            return [
              createObservedEventRecord({
                provider: "claude",
                filePath: context.filePath,
                root: context.root,
                sessionId: "session-rotate-race",
                cursor: {
                  provider: "claude",
                  rootPath: root.path,
                  filePath: context.filePath,
                  byteOffset: 11,
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
    expect(readStoredCursor()).toBeNull();

    await service.scanNow();

    expect(parseCursors).toEqual([null, null]);
    expect(warnings.map((warning) => warning.code)).toEqual(["cursor-reset"]);
    const refreshedCursor = readStoredCursor();

    if (!refreshedCursor) {
      throw new Error("Expected the follow-up scan to persist a refreshed cursor");
    }

    expect(refreshedCursor.fingerprint).toBeDefined();
    expect(refreshedCursor.continuityToken).toBeDefined();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("scanNow does not persist cursors when same-inode rewrites change the pre-parse prefix during parsing", async () => {
  const initialContents = "a".repeat(16);
  const rewrittenContents = "b".repeat(16);
  const workspace = await createFixtureWorkspace({
    "claude/rewrite-race.jsonl": initialContents,
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(workspace, "claude", "rewrite-race.jsonl");
    const initialStats = await stat(filePath);

    const parseCursors: (IngestCursor | null)[] = [];
    const warnings: IngestWarning[] = [];
    let storedCursor: IngestCursor | null = null;
    const readStoredCursor = (): IngestCursor | null => storedCursor;
    let nextByteOffset = 8;
    let rewriteBeforeParse = false;

    const service = createSessionIngestService({
      roots: [root],
      registries: [
        createRegistry({
          provider: "claude",
          matchExtension: ".jsonl",
          async beforeParse(context) {
            if (!rewriteBeforeParse) {
              return;
            }

            rewriteBeforeParse = false;
            await Bun.write(context.filePath, rewrittenContents);
            await utimes(context.filePath, initialStats.atime, initialStats.mtime);
          },
          recordFactory(context) {
            parseCursors.push(context.cursor);

            return [
              createObservedEventRecord({
                provider: "claude",
                filePath: context.filePath,
                root: context.root,
                sessionId: "session-rewrite-race",
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

    expect(readStoredCursor()?.byteOffset).toBe(8);

    nextByteOffset = initialContents.length;
    rewriteBeforeParse = true;
    await service.scanNow();

    expect(readStoredCursor()?.byteOffset).toBe(8);

    await service.scanNow();

    expect(parseCursors.map((cursor) => cursor?.byteOffset ?? null)).toEqual([null, 8, null]);
    expect(warnings.map((warning) => warning.code)).toEqual(["cursor-reset", "cursor-reset"]);
    expect(readStoredCursor()?.byteOffset).toBe(initialContents.length);
    expect(readStoredCursor()?.continuityToken).toBeDefined();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("scanNow does not persist initial EOF cursors when same-inode rewrites change the file during parsing", async () => {
  const initialContents = "a".repeat(16);
  const rewrittenContents = "b".repeat(16);
  const workspace = await createFixtureWorkspace({
    "claude/initial-rewrite-race.jsonl": initialContents,
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(workspace, "claude", "initial-rewrite-race.jsonl");
    const initialStats = await stat(filePath);

    const parseCursors: (IngestCursor | null)[] = [];
    const warnings: IngestWarning[] = [];
    let storedCursor: IngestCursor | null = null;
    const readStoredCursor = (): IngestCursor | null => storedCursor;
    let rewriteBeforeParse = true;

    const service = createSessionIngestService({
      roots: [root],
      registries: [
        createRegistry({
          provider: "claude",
          matchExtension: ".jsonl",
          async beforeParse(context) {
            if (!rewriteBeforeParse) {
              return;
            }

            rewriteBeforeParse = false;
            await Bun.write(context.filePath, rewrittenContents);
            await utimes(context.filePath, initialStats.atime, initialStats.mtime);
          },
          recordFactory(context) {
            parseCursors.push(context.cursor);

            return [
              createObservedEventRecord({
                provider: "claude",
                filePath: context.filePath,
                root: context.root,
                sessionId: "session-initial-rewrite-race",
                cursor: {
                  provider: "claude",
                  rootPath: root.path,
                  filePath: context.filePath,
                  byteOffset: initialContents.length,
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

    expect(readStoredCursor()).toBeNull();

    await service.scanNow();

    expect(parseCursors).toEqual([null, null]);
    expect(warnings.map((warning) => warning.code)).toEqual(["cursor-reset"]);
    expect(readStoredCursor()?.byteOffset).toBe(initialContents.length);
    expect(readStoredCursor()?.continuityToken).toBeDefined();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("scanNow keeps the stored cursor when file state cannot be read", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/a-keep.jsonl": "keep\n",
    "claude/b-disappear.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const disappearingFilePath = join(workspace, "claude", "b-disappear.jsonl");

    const warnings: IngestWarning[] = [];
    const storedCursors = new Map<string, IngestCursor>();
    let removeDuringNextScan = false;

    const service = createSessionIngestService({
      roots: [root],
      registries: [
        createRegistry({
          provider: "claude",
          matchExtension: ".jsonl",
          async beforeParse(context) {
            if (!removeDuringNextScan || !context.filePath.endsWith("a-keep.jsonl")) {
              return;
            }

            removeDuringNextScan = false;
            await rm(disappearingFilePath);
          },
          recordFactory(context) {
            return [
              createObservedEventRecord({
                provider: "claude",
                filePath: context.filePath,
                root: context.root,
                sessionId: `session:${context.filePath}`,
                cursor: {
                  provider: "claude",
                  rootPath: root.path,
                  filePath: context.filePath,
                  byteOffset: context.filePath.endsWith("a-keep.jsonl") ? 4 : 7,
                  line: 1,
                },
              }),
            ];
          },
        }),
      ],
      cursorStore: {
        async get(key) {
          return storedCursors.get(key.filePath) ?? null;
        },
        async set(cursor) {
          storedCursors.set(cursor.filePath, cursor);
        },
        async delete(key) {
          storedCursors.delete(key.filePath);
        },
      },
      onWarning(warning) {
        warnings.push(warning);
      },
    });

    await service.scanNow();

    const persistedCursor = storedCursors.get(disappearingFilePath);

    removeDuringNextScan = true;
    await service.scanNow();

    expect(warnings.map((warning) => warning.code)).toEqual(["file-open-failed"]);
    expect(storedCursors.get(disappearingFilePath)).toEqual(persistedCursor);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});
