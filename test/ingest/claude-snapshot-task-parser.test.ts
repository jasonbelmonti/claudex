import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionRecord,
} from "claudex/ingest";
import { createSessionIngestService } from "claudex/ingest";
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
  };

  const eventTypes: string[] = [];
  const warningCodes: string[] = [];
  const observedSessionReasons: string[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeSnapshotTaskIngestRegistry()],
    onObservedEvent(record: ObservedAgentEvent) {
      eventTypes.push(record.event.type);
    },
    onObservedSession(record: ObservedSessionRecord) {
      observedSessionReasons.push(record.reason);
    },
    onWarning(warning: IngestWarning) {
      warningCodes.push(warning.code);
    },
  });

  await service.scanNow();

  expect(eventTypes).toEqual([
    "message.completed",
    "message.delta",
  ]);
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
