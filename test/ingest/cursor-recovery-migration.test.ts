import { expect, test } from "bun:test";
import { join } from "node:path";

import type { IngestCursor, IngestWarning } from "claudex/ingest";
import { createSessionIngestService } from "claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  createRegistry,
  removeFixtureWorkspace,
  rotateFile,
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
