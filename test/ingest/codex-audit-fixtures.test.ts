import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type {
  IngestCursor,
  IngestWarning,
  ObservedAgentEvent,
  ObservedSessionRecord,
} from "@jasonbelmonti/claudex/ingest";
import {
  createInMemoryCursorStore,
  createSessionIngestService,
} from "@jasonbelmonti/claudex/ingest";
import {
  createCodexIngestRegistries,
  createCodexTranscriptIngestRegistry,
} from "../../src/ingest/codex/index.js";
import {
  createFixtureWorkspace,
  removeFixtureWorkspace,
} from "./helpers.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces.splice(0).map((workspace) => removeFixtureWorkspace(workspace)),
  );
});

async function readCodexFixture(name: string): Promise<string> {
  return Bun.file(new URL(`../fixtures/codex/${name}`, import.meta.url)).text();
}

test("branch-expansion fixture replays deterministic Codex tool, usage, and mirror-collapse paths", async () => {
  const fixture = await readCodexFixture("transcript-branch-expansion.jsonl");
  const workspace = await createFixtureWorkspace({
    "codex/transcript.jsonl": fixture,
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
    metadata: {
      lane: "branch-expansion",
    },
  };

  const observedEvents: ObservedAgentEvent[] = [];
  const observedSessions: ObservedSessionRecord[] = [];
  const warnings: IngestWarning[] = [];
  const service = createSessionIngestService({
    roots: [root],
    registries: [createCodexTranscriptIngestRegistry()],
    onObservedEvent(record) {
      observedEvents.push(record);
    },
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(observedEvents.map((record) => record.event.type)).toEqual([
    "session.started",
    "turn.started",
    "reasoning.summary",
    "tool.started",
    "tool.completed",
    "tool.started",
    "tool.completed",
    "tool.started",
    "tool.completed",
    "message.completed",
    "turn.completed",
  ]);
  expect(observedSessions.map((record) => ({
    sessionId: record.observedSession.sessionId,
    state: record.observedSession.state,
    reason: record.reason,
  }))).toEqual([
    {
      sessionId: "session-codex-branch-expansion",
      state: "canonical",
      reason: "transcript",
    },
  ]);
  expect(warnings).toEqual([]);
  expect(observedEvents[0]?.source.metadata).toEqual({
    lane: "branch-expansion",
  });
  expect(observedEvents[3]?.event).toMatchObject({
    type: "tool.started",
    toolName: "command_execution",
    kind: "command",
  });
  expect(observedEvents[5]?.event).toMatchObject({
    type: "tool.started",
    toolName: "workspace-write",
    kind: "custom",
  });
  expect(observedEvents[7]?.event).toMatchObject({
    type: "tool.started",
    toolName: "web_search",
    kind: "custom",
  });
  expect(observedEvents[10]?.event).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Coverage expanded without duplicate semantic events.",
      usage: {
        tokens: {
          input: 144,
          cachedInput: 32,
          output: 55,
        },
        providerUsage: {
          reasoningOutputTokens: 13,
          totalTokens: 199,
          modelContextWindow: 258_400,
        },
      },
    },
  });
});

test("warning fixture preserves file attribution and warning propagation across malformed Codex transcript lines", async () => {
  const fixture = await readCodexFixture("transcript-warning-paths.jsonl");
  const workspace = await createFixtureWorkspace({
    "codex/warnings.jsonl": fixture,
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
    metadata: {
      lane: "warning-propagation",
    },
  };
  const filePath = join(workspace, "codex", "warnings.jsonl");
  const observedEvents: ObservedAgentEvent[] = [];
  const observedSessions: ObservedSessionRecord[] = [];
  const warnings: IngestWarning[] = [];
  const service = createSessionIngestService({
    roots: [root],
    registries: [createCodexTranscriptIngestRegistry()],
    onObservedEvent(record) {
      observedEvents.push(record);
    },
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(observedEvents.map((record) => record.event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "turn.completed",
  ]);
  expect(warnings.map((warning) => warning.code)).toEqual([
    "unsupported-record",
    "unsupported-record",
    "unsupported-record",
    "unsupported-record",
    "parse-failed",
  ]);
  expect(warnings[0]).toMatchObject({
    provider: "codex",
    filePath,
    source: {
      provider: "codex",
      kind: "transcript",
      filePath,
    },
  });
  expect(
    observedSessions.filter((record) => record.completeness === "partial"),
  ).toHaveLength(5);
  expect(observedSessions.at(-1)).toMatchObject({
    observedSession: {
      sessionId: "session-codex-warning-paths",
      state: "canonical",
    },
    reason: "transcript",
  });
});

test("incremental replay fixtures preserve mirror collapse and only emit newly completed Codex results", async () => {
  const initialTranscript = await readCodexFixture(
    "transcript-incremental-replay.initial.jsonl",
  );
  const resumedTranscript = await readCodexFixture(
    "transcript-incremental-replay.resumed.jsonl",
  );
  const workspace = await createFixtureWorkspace({
    "codex/transcript.jsonl": initialTranscript,
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, "codex"),
  };
  const filePath = join(workspace, "codex", "transcript.jsonl");
  const observedEvents: string[] = [];
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
    onObservedEvent(record) {
      observedEvents.push(record.event.type);
    },
  });

  await service.scanNow();

  expect(observedEvents).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "reasoning.summary",
  ]);

  observedEvents.length = 0;
  await Bun.write(filePath, resumedTranscript);
  await service.scanNow();

  expect(parseCursors).toHaveLength(2);
  expect(parseCursors[0]).toBeNull();
  expect(parseCursors[1]?.byteOffset).toBe(initialTranscript.length);
  expect(observedEvents).toEqual(["turn.completed"]);
});

test("fixture-backed Codex bootstrap refinement promotes provisional session identity to canonical transcript identity", async () => {
  const bootstrapFixture = await readCodexFixture(
    "session-index-provisional-refinement.jsonl",
  );
  const transcriptFixture = await readCodexFixture(
    "transcript-provisional-refinement.jsonl",
  );
  const transcriptRelativePath = join(
    ".codex",
    "sessions",
    "2026",
    "04",
    "09",
    "rollout-2026-04-09T20-30-00-session-codex-refinement.jsonl",
  );
  const workspace = await createFixtureWorkspace({
    ".codex/session_index.jsonl": bootstrapFixture,
    [transcriptRelativePath]: transcriptFixture,
  });
  workspaces.push(workspace);

  const root = {
    provider: "codex" as const,
    path: join(workspace, ".codex"),
    recursive: true,
  };

  const observedSessions: ObservedSessionRecord[] = [];
  const observedEvents: ObservedAgentEvent[] = [];
  const warnings: IngestWarning[] = [];
  const service = createSessionIngestService({
    roots: [root],
    registries: createCodexIngestRegistries(),
    onObservedSession(record) {
      observedSessions.push(record);
    },
    onObservedEvent(record) {
      observedEvents.push(record);
    },
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(observedSessions.map((record) => ({
    sessionId: record.observedSession.sessionId,
    state: record.observedSession.state,
    reason: record.reason,
    kind: record.source.kind,
  }))).toEqual([
    {
      sessionId: "session-codex-refinement",
      state: "provisional",
      reason: "index",
      kind: "session-index",
    },
    {
      sessionId: "session-codex-refinement",
      state: "canonical",
      reason: "transcript",
      kind: "transcript",
    },
  ]);
  expect(observedEvents.map((record) => record.event.type)).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "turn.completed",
  ]);
  expect(warnings).toEqual([]);
});
