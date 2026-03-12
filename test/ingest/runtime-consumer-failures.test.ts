import { expect, test } from "bun:test";
import { join } from "node:path";

import type { IngestCursor, IngestWarning } from "claudex/ingest";
import { createSessionIngestService } from "claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createRegistry,
  removeFixtureWorkspace,
} from "./helpers";

test("scanNow throws consumer callback failures without advancing the cursor", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/consumer-failure.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const warnings: IngestWarning[] = [];
    let storedCursor: IngestCursor | null = null;

    const service = createSessionIngestService({
      roots: [root],
      registries: [
        createRegistry({
          provider: "claude",
          matchExtension: ".jsonl",
          recordFactory(context) {
            return [
              createObservedEventRecord({
                provider: "claude",
                filePath: context.filePath,
                root: context.root,
                sessionId: "session-consumer-failure",
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
      onObservedEvent() {
        throw new Error("consumer callback failed");
      },
      onWarning(warning) {
        warnings.push(warning);
      },
    });

    await expect(service.scanNow()).rejects.toThrow("consumer callback failed");
    expect(warnings).toEqual([]);
    expect(storedCursor).toBeNull();
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("scanNow does not duplicate onRecord deliveries when a later typed callback fails", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/consumer-replay.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(workspace, "claude", "consumer-replay.jsonl");
    const onRecordDeliveries: string[] = [];
    let storedCursor: IngestCursor | null = null;
    const readStoredCursor = (): IngestCursor | null => storedCursor;
    let failObservedEvent = true;

    const service = createSessionIngestService({
      roots: [root],
      registries: [
        createRegistry({
          provider: "claude",
          matchExtension: ".jsonl",
          recordFactory(context) {
            return [
              createObservedEventRecord({
                provider: "claude",
                filePath: context.filePath,
                root: context.root,
                sessionId: "session-consumer-replay",
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
      onRecord(record) {
        onRecordDeliveries.push(record.source.filePath);
      },
      onObservedEvent() {
        if (!failObservedEvent) {
          return;
        }

        failObservedEvent = false;
        throw new Error("consumer callback failed");
      },
    });

    await expect(service.scanNow()).rejects.toThrow("consumer callback failed");
    expect(onRecordDeliveries).toEqual([]);
    expect(readStoredCursor()).toBeNull();

    await service.scanNow();

    expect(onRecordDeliveries).toEqual([filePath]);
    expect(readStoredCursor()?.byteOffset).toBe(7);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});

test("scanNow preserves the original consumer error when iterator cleanup fails", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/consumer-cleanup-failure.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(workspace, "claude", "consumer-cleanup-failure.jsonl");
    let storedCursor: IngestCursor | null = null;
    const readStoredCursor = (): IngestCursor | null => storedCursor;
    let observedEventCalls = 0;

    const service = createSessionIngestService({
      roots: [root],
      registries: [
        {
          provider: "claude",
          matchFile(candidatePath) {
            return candidatePath.endsWith(".jsonl") ? { kind: "transcript" as const } : null;
          },
          parseFile(context) {
            let index = 0;
            const iterator: AsyncIterableIterator<ReturnType<typeof createObservedEventRecord>> = {
              async next() {
                if (index === 0) {
                  index += 1;
                  return {
                    done: false,
                    value: createObservedEventRecord({
                      provider: "claude",
                      filePath: context.filePath,
                      root: context.root,
                      sessionId: "session-cleanup-failure:first",
                      cursor: {
                        provider: "claude",
                        rootPath: root.path,
                        filePath: context.filePath,
                        byteOffset: 3,
                        line: 1,
                      },
                    }),
                  };
                }

                if (index === 1) {
                  index += 1;
                  return {
                    done: false,
                    value: createObservedEventRecord({
                      provider: "claude",
                      filePath: context.filePath,
                      root: context.root,
                      sessionId: "session-cleanup-failure:second",
                      cursor: {
                        provider: "claude",
                        rootPath: root.path,
                        filePath: context.filePath,
                        byteOffset: 7,
                        line: 1,
                      },
                    }),
                  };
                }

                return {
                  done: true,
                  value: undefined,
                };
              },
              async return() {
                throw new Error("iterator cleanup failed");
              },
              [Symbol.asyncIterator]() {
                return iterator;
              },
            };

            return iterator;
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
      onObservedEvent() {
        observedEventCalls += 1;

        if (observedEventCalls === 2) {
          throw new Error("consumer callback failed");
        }
      },
    });

    await expect(service.scanNow()).rejects.toThrow("consumer callback failed");
    expect(readStoredCursor()?.filePath).toBe(filePath);
    expect(readStoredCursor()?.byteOffset).toBe(3);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});
