import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type { IngestCursor } from "claudex/ingest";
import {
  createInMemoryCursorStore,
  createSessionIngestService,
} from "claudex/ingest";
import { createCodexTranscriptIngestRegistry } from "../../src/ingest/codex";
import {
  createFixtureWorkspace,
  removeFixtureWorkspace,
} from "./helpers";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)));
});

test("transcript registry ignores Codex session-index files", async () => {
  const workspace = await createFixtureWorkspace({
    "codex/session-index.jsonl": "{\"hello\":\"world\"}\n",
  });
  workspaces.push(workspace);

  const sessions: string[] = [];
  const warnings: string[] = [];
  const service = createSessionIngestService({
    roots: [
      {
        provider: "codex" as const,
        path: join(workspace, "codex"),
      },
    ],
    registries: [createCodexTranscriptIngestRegistry()],
    onObservedSession(record) {
      sessions.push(record.source.filePath);
    },
    onWarning(warning) {
      warnings.push(warning.code);
    },
  });

  await service.scanNow();

  expect(sessions).toEqual([]);
  expect(warnings).toEqual([]);
});

test("transcript parser does not invent sessions for blank files", async () => {
  const workspace = await createFixtureWorkspace({
    "codex/blank.jsonl": "\n   \n",
  });
  workspaces.push(workspace);

  const sessions: string[] = [];
  const warnings: string[] = [];
  const service = createSessionIngestService({
    roots: [
      {
        provider: "codex" as const,
        path: join(workspace, "codex"),
      },
    ],
    registries: [createCodexTranscriptIngestRegistry()],
    onObservedSession(record) {
      sessions.push(record.observedSession.sessionId);
    },
    onWarning(warning) {
      warnings.push(warning.code);
    },
  });

  await service.scanNow();

  expect(sessions).toEqual([]);
  expect(warnings).toEqual([]);
});

test("transcript parser persists an EOF cursor for trailing turn_context lines", async () => {
  const transcript = [
    JSON.stringify({
      type: "session_meta",
      payload: {
        id: "session-codex-1",
      },
    }),
    JSON.stringify({
      type: "turn_context",
      payload: {
        turn_id: "turn-2",
      },
    }),
    "",
  ].join("\n");
  const workspace = await createFixtureWorkspace({
    "codex/transcript.jsonl": transcript,
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
  };
  const filePath = join(workspace, "codex", "transcript.jsonl");
  const cursorKey = {
    provider: "codex" as const,
    rootPath: root.path,
    filePath,
  };
  const parseCursors: (IngestCursor | null)[] = [];
  const baseRegistry = createCodexTranscriptIngestRegistry();
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

  await service.reconcileNow();

  expect(parseCursors).toEqual([null]);
});
