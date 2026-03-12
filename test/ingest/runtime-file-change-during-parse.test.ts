import { expect, test } from "bun:test";
import { join } from "node:path";

import type { IngestCursor, IngestWarning } from "claudex/ingest";
import { createSessionIngestService } from "claudex/ingest";

import {
  createFixtureWorkspace,
  createObservedEventRecord,
  removeFixtureWorkspace,
  truncateFile,
} from "./helpers";

test("scanNow does not persist cursors when the file is rewritten in place during parsing", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/rewrite-during-parse.jsonl": "abcdef\n",
  });

  try {
    const root = {
      provider: "claude" as const,
      path: join(workspace, "claude"),
    };
    const filePath = join(workspace, "claude", "rewrite-during-parse.jsonl");
    const warnings: IngestWarning[] = [];
    const parseCursors: (IngestCursor | null)[] = [];
    let storedCursor: IngestCursor | null = null;
    const readStoredCursor = (): IngestCursor | null => storedCursor;
    let rewriteDuringParse = true;

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
              sessionId: "session-rewrite-during-parse",
              cursor: {
                provider: "claude",
                rootPath: root.path,
                filePath: context.filePath,
                byteOffset: 7,
                line: 1,
              },
            });

            if (!rewriteDuringParse) {
              return;
            }

            rewriteDuringParse = false;
            await truncateFile(context.filePath, 0);
            await Bun.write(context.filePath, "ghijkl\n");
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
    expect(readStoredCursor()).toBeNull();

    await service.scanNow();

    expect(parseCursors).toEqual([null, null]);
    expect(warnings.map((warning) => warning.code)).toEqual(["cursor-reset"]);

    const refreshedCursor = readStoredCursor();

    if (!refreshedCursor) {
      throw new Error("Expected the follow-up scan to persist a refreshed cursor");
    }

    expect(refreshedCursor.byteOffset).toBe(7);
  } finally {
    await removeFixtureWorkspace(workspace);
  }
});
