import { afterEach, expect, test } from "bun:test";
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
    metadata: { lane: "transcript" },
  };

  const observedEvents: ObservedAgentEvent[] = [];
  const sessionKinds: string[] = [];
  const warningCodes: string[] = [];

  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeTranscriptIngestRegistry()],
    onObservedEvent(record: ObservedAgentEvent) {
      observedEvents.push(record);
    },
    onObservedSession(record: ObservedSessionRecord) {
      sessionKinds.push(record.reason);
    },
    onWarning(warning: IngestWarning) {
      warningCodes.push(warning.code);
    },
  });

  await service.scanNow();

  expect(observedEvents.map((record) => record.event.type)).toEqual([
    "message.completed",
    "message.delta",
    "turn.completed",
  ]);
  expect(observedEvents[0]?.source.metadata).toEqual({ lane: "transcript" });
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

test("transcript parser reuses assistant text for success results with empty terminal text", async () => {
  const workspace = await createFixtureWorkspace({
    "claude/transcript.jsonl": [
      JSON.stringify({
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [
            {
              type: "text",
              text: "Assistant fallback",
            },
          ],
        },
      }),
      JSON.stringify({
        type: "result",
        subtype: "success",
        session_id: "session-1",
        result: "",
      }),
      "",
    ].join("\n"),
  });
  workspaces.push(workspace);

  const observedEvents: ObservedAgentEvent[] = [];
  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };

  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeTranscriptIngestRegistry()],
    onObservedEvent(record: ObservedAgentEvent) {
      observedEvents.push(record);
    },
  });

  await service.scanNow();

  expect(observedEvents).toHaveLength(2);
  expect(observedEvents[1]?.event).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Assistant fallback",
      usage: null,
    },
  });
});

test("transcript parser preserves assistant fallback across incremental reconcile passes", async () => {
  const initialContents = `${JSON.stringify({
    type: "assistant",
    session_id: "session-1",
    message: {
      content: [
        {
          type: "text",
          text: "Assistant fallback",
        },
      ],
    },
  })}\n`;
  const appendedResult = `${JSON.stringify({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "",
  })}\n`;
  const workspace = await createFixtureWorkspace({
    "claude/transcript.jsonl": initialContents,
  });
  workspaces.push(workspace);

  const filePath = join(workspace, "claude", "transcript.jsonl");
  const observedEvents: ObservedAgentEvent[] = [];
  const root = {
    provider: "claude" as const,
    path: join(workspace, "claude"),
  };
  const service = createSessionIngestService({
    roots: [root],
    registries: [createClaudeTranscriptIngestRegistry()],
    cursorStore: createInMemoryCursorStore(),
    onObservedEvent(record: ObservedAgentEvent) {
      observedEvents.push(record);
    },
  });

  await service.scanNow();
  await Bun.write(filePath, initialContents + appendedResult);
  await service.reconcileNow();

  expect(observedEvents).toHaveLength(2);
  expect(observedEvents[1]?.event).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Assistant fallback",
      usage: null,
    },
  });
});
