import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionRecord,
} from "claudex/ingest";
import { createSessionIngestService } from "claudex/ingest";
import { createClaudeTranscriptIngestRegistry } from "../../src/ingest/claude";
import {
  createFixtureWorkspace,
  removeFixtureWorkspace,
} from "./helpers";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)));
});

test("transcript parser emits normalized events and warnings for malformed lines", async () => {
  const fixture = await Bun.file(new URL("../fixtures/claude/transcript.jsonl", import.meta.url)).text();
  const workspace = await createFixtureWorkspace({
    "claude/transcript.jsonl": fixture,
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
    registries: [createClaudeTranscriptIngestRegistry()],
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

  expect(eventTypes).toEqual([
    "message.completed",
    "message.delta",
    "turn.completed",
  ]);
  expect(sessionKinds).toEqual(["transcript"]);
  expect(warningCodes).toEqual(["parse-failed"]);
});

test("transcript parser enriches unsupported-record warnings with file attribution", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/transcript.jsonl": "{\"hello\":\"world\"}\n",
  });
  workspaces.push(workspace);

  const filePath = join(workspace, "claude", "transcript.jsonl");
  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };

  const warnings: IngestWarning[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeTranscriptIngestRegistry()],
    onWarning(warning: IngestWarning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatchObject({
    code: "unsupported-record",
    provider: "claude",
    filePath,
    source: {
      provider: "claude",
      kind: "transcript",
      discoveryPhase: "initial_scan",
      rootPath: root.path,
      filePath,
    },
  });
});
