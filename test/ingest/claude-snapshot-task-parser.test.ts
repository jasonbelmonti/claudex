import { afterEach, expect, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionRecord,
} from "claudex/ingest";
import {
  createInMemoryCursorStore,
  createSessionIngestService,
} from "claudex/ingest";
import { createClaudeSnapshotTaskIngestRegistry } from "../../src/ingest/claude";
import {
  createFixtureWorkspace,
  removeFixtureWorkspace,
} from "./helpers";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)));
});

test("snapshot/task parser normalizes artifact arrays and records malformed records non-fatally", async () => {
  const fixture = await Bun.file(new URL("../fixtures/claude/snapshot-task.json", import.meta.url)).text();
  const workspace = await createFixtureWorkspace({
    "claude/snapshot-task.json": fixture,
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
    metadata: { lane: "snapshot" },
  };

  const observedEvents: ObservedAgentEvent[] = [];
  const warningCodes: string[] = [];
  const observedSessionReasons: string[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeSnapshotTaskIngestRegistry()],
    onObservedEvent(record: ObservedAgentEvent) {
      observedEvents.push(record);
    },
    onObservedSession(record: ObservedSessionRecord) {
      observedSessionReasons.push(record.reason);
    },
    onWarning(warning: IngestWarning) {
      warningCodes.push(warning.code);
    },
  });

  await service.scanNow();

  expect(observedEvents.map((record) => record.event.type)).toEqual([
    "message.completed",
    "message.delta",
  ]);
  expect(observedEvents[0]?.source.metadata).toEqual({ lane: "snapshot" });
  expect(observedSessionReasons).toEqual(["snapshot"]);
  expect(warningCodes).toEqual(["unsupported-record"]);
});

test("snapshot/task parser emits parse-failed warnings for malformed JSON without crashing", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/bad-snapshot.json": "{ \"records\": [ { \"type\": \"assistant\" }",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };

  const warningCodes: string[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeSnapshotTaskIngestRegistry()],
    onWarning(warning) {
      warningCodes.push(warning.code);
    },
  });

  await service.scanNow();

  expect(warningCodes).toEqual(["parse-failed"]);
});

test("snapshot/task parser ignores unrelated JSON files without warning", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/nested/config.json": "{ \"hello\": \"world\" }",
  });
  workspaces.push(workspace);

  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };

  const eventTypes: string[] = [];
  const sessionKinds: string[] = [];
  const warningCodes: string[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeSnapshotTaskIngestRegistry()],
    onObservedEvent(record: ObservedAgentEvent) {
      eventTypes.push(record.event.type);
    },
    onObservedSession(record: ObservedSessionRecord) {
      sessionKinds.push(record.reason);
    },
    onWarning(warning: IngestWarning) {
      warningCodes.push(warning.code);
    },
  });

  await service.scanNow();

  expect(eventTypes).toEqual([]);
  expect(sessionKinds).toEqual([]);
  expect(warningCodes).toEqual([]);
});

test("snapshot/task parser resumes remaining records after a consumer failure", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/snapshot-task.json": JSON.stringify({
      type: "snapshot",
      records: [
        {
          type: "assistant",
          session_id: "session-1",
          message: {
            content: [{ type: "text", text: "first" }],
          },
        },
        {
          type: "assistant",
          session_id: "session-1",
          message: {
            content: [{ type: "text", text: "second" }],
          },
        },
        {
          type: "assistant",
          session_id: "session-1",
          message: {
            content: [{ type: "text", text: "third" }],
          },
        },
      ],
    }),
  });
  workspaces.push(workspace);

  const deliveredTexts: string[] = [];
  let failSecondEvent = true;
  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeSnapshotTaskIngestRegistry()],
    cursorStore: createInMemoryCursorStore(),
    onObservedEvent(record: ObservedAgentEvent) {
      if (record.event.type !== "message.completed") {
        return;
      }

      if (failSecondEvent && record.event.text === "second") {
        failSecondEvent = false;
        throw new Error("consumer callback failed");
      }

      deliveredTexts.push(record.event.text);
    },
  });

  await expect(service.scanNow()).rejects.toThrow("consumer callback failed");
  expect(deliveredTexts).toEqual(["first"]);

  await service.scanNow();

  expect(deliveredTexts).toEqual(["first", "second", "third"]);
});

test("snapshot/task parser resets stale partial replay progress after an in-place rewrite", async () => {
  const initialContents = JSON.stringify({
    type: "snapshot",
    records: [
      {
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [{ type: "text", text: "a" }],
        },
      },
      {
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [{ type: "text", text: "b" }],
        },
      },
      {
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [{ type: "text", text: "c" }],
        },
      },
    ],
  });
  const rewrittenContents = JSON.stringify({
    type: "snapshot",
    records: [
      {
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [{ type: "text", text: "x" }],
        },
      },
      {
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [{ type: "text", text: "y" }],
        },
      },
      {
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [{ type: "text", text: "z" }],
        },
      },
    ],
  });

  expect(initialContents.length).toBe(rewrittenContents.length);

  const workspace = await createFixtureWorkspace({
    "claude/snapshot-task.json": initialContents,
  });
  workspaces.push(workspace);

  const filePath = join(workspace, "claude", "snapshot-task.json");
  const deliveredTexts: string[] = [];
  let failSecondEvent = true;
  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeSnapshotTaskIngestRegistry()],
    cursorStore: createInMemoryCursorStore(),
    onObservedEvent(record: ObservedAgentEvent) {
      if (record.event.type !== "message.completed") {
        return;
      }

      if (failSecondEvent && record.event.text === "b") {
        failSecondEvent = false;
        throw new Error("consumer callback failed");
      }

      deliveredTexts.push(record.event.text);
    },
  });

  await expect(service.scanNow()).rejects.toThrow("consumer callback failed");
  expect(deliveredTexts).toEqual(["a"]);

  const beforeRewrite = await stat(filePath);
  await writeFile(filePath, rewrittenContents);
  const afterRewrite = await stat(filePath);

  expect(afterRewrite.dev).toBe(beforeRewrite.dev);
  expect(afterRewrite.ino).toBe(beforeRewrite.ino);

  await service.scanNow();

  expect(deliveredTexts).toEqual(["a", "x", "y", "z"]);
});
