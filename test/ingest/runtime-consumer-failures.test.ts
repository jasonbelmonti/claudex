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
    const filePath = join(workspace, "claude", "consumer-failure.jsonl");
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
