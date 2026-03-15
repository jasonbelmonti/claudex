import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";

import type { IngestCursor, IngestWarning } from "claudex/ingest";
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

test("transcript registry ignores Windows session-index paths", () => {
  const registry = createCodexTranscriptIngestRegistry();
  const root = {
    provider: "codex" as const,
    path: "C:\\repo\\codex",
  };

  expect(
    registry.matchFile("C:\\repo\\codex\\session-index.jsonl", root),
  ).toBeNull();
  expect(
    registry.matchFile("C:\\repo\\codex\\session_index.jsonl", root),
  ).toBeNull();
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

test("transcript parser collapses mirrored assistant and reasoning records", async () => {
  const assistantText = "Codex should say this once.";
  const reasoningText = "Codex should summarize this once.";
  const workspace = await createFixtureWorkspace({
    "codex/transcript.jsonl": [
      JSON.stringify({
        timestamp: "2026-03-15T14:29:00.000Z",
        type: "session_meta",
        payload: {
          id: "session-codex-bel-392",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:01.000Z",
        type: "event_msg",
        payload: {
          type: "task_started",
          turn_id: "turn-bel-392",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:02.000Z",
        type: "event_msg",
        payload: {
          type: "user_message",
          message: "Verify BEL-392",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:03.000Z",
        type: "event_msg",
        payload: {
          type: "agent_message",
          message: assistantText,
          phase: "commentary",
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:03.100Z",
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: assistantText,
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:03.200Z",
        type: "event_msg",
        payload: {
          type: "agent_reasoning",
          text: reasoningText,
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:03.300Z",
        type: "response_item",
        payload: {
          type: "reasoning",
          summary: [
            {
              type: "summary_text",
              text: reasoningText,
            },
          ],
        },
      }),
      JSON.stringify({
        timestamp: "2026-03-15T14:29:04.000Z",
        type: "event_msg",
        payload: {
          type: "task_complete",
          turn_id: "turn-bel-392",
          last_agent_message: assistantText,
        },
      }),
      "",
    ].join("\n"),
  });
  workspaces.push(workspace);

  const eventTypes: string[] = [];
  const warnings: string[] = [];
  const service = createSessionIngestService({
    roots: [
      {
        provider: "codex" as const,
        path: join(workspace, "codex"),
      },
    ],
    registries: [createCodexTranscriptIngestRegistry()],
    onObservedEvent(record) {
      eventTypes.push(record.event.type);
    },
    onWarning(warning) {
      warnings.push(warning.code);
    },
  });

  await service.scanNow();

  expect(eventTypes).toEqual([
    "session.started",
    "turn.started",
    "message.completed",
    "reasoning.summary",
    "turn.completed",
  ]);
  expect(warnings).toEqual([]);
});

test("transcript parser preserves mirror-collapse across cursor resumes", async () => {
  const assistantText = "Resume should not duplicate this.";
  const reasoningText = "Resume should not duplicate this summary.";
  const initialTranscript = [
    JSON.stringify({
      timestamp: "2026-03-15T14:29:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-codex-resume",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:01.000Z",
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-bel-392-resume",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:02.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "Verify BEL-392 resume coverage",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:03.000Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: assistantText,
        phase: "commentary",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:03.100Z",
      type: "event_msg",
      payload: {
        type: "agent_reasoning",
        text: reasoningText,
      },
    }),
    "",
  ].join("\n");
  const resumedTranscript = [
    initialTranscript.trimEnd(),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:03.200Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: assistantText,
          },
        ],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:03.300Z",
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [
          {
            type: "summary_text",
            text: reasoningText,
          },
        ],
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:04.000Z",
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-bel-392-resume",
        last_agent_message: assistantText,
      },
    }),
    "",
  ].join("\n");
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

test("transcript parser emits a canonical session when the final line also emits events", async () => {
  const workspace = await createFixtureWorkspace({
    "codex/transcript.jsonl": `${JSON.stringify({
      type: "session_meta",
      payload: {
        id: "session-codex-final-line",
      },
    })}\n`,
  });
  workspaces.push(workspace);

  const sessions: Array<{ sessionId: string; state: string }> = [];
  const service = createSessionIngestService({
    roots: [
      {
        provider: "codex" as const,
        path: join(workspace, "codex"),
      },
    ],
    registries: [createCodexTranscriptIngestRegistry()],
    onObservedSession(record) {
      sessions.push({
        sessionId: record.observedSession.sessionId,
        state: record.observedSession.state,
      });
    },
  });

  await service.scanNow();

  expect(sessions).toEqual([
    {
      sessionId: "session-codex-final-line",
      state: "canonical",
    },
  ]);
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

test("transcript parser does not invent sessions for turn_context-only files", async () => {
  const transcript = `${JSON.stringify({
    type: "turn_context",
    payload: {
      turn_id: "turn-1",
    },
  })}\n`;
  const workspace = await createFixtureWorkspace({
    "codex/turn-context-only.jsonl": transcript,
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

test("transcript parser surfaces malformed and partial transcript warnings through onWarning", async () => {
  const transcript = [
    JSON.stringify({
      timestamp: "2026-03-15T14:29:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-codex-warning-path",
      },
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:01.000Z",
      type: "event_msg",
      payload: {},
    }),
    JSON.stringify({
      timestamp: "2026-03-15T14:29:02.000Z",
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [],
      },
    }),
    "{ bad json",
    "",
  ].join("\n");
  const workspace = await createFixtureWorkspace({
    "codex/warnings.jsonl": transcript,
  });
  workspaces.push(workspace);

  const filePath = join(workspace, "codex", "warnings.jsonl");
  const warnings: IngestWarning[] = [];
  const service = createSessionIngestService({
    roots: [
      {
        provider: "codex" as const,
        path: join(workspace, "codex"),
      },
    ],
    registries: [createCodexTranscriptIngestRegistry()],
    onWarning(warning) {
      warnings.push(warning);
    },
  });

  await service.scanNow();

  expect(warnings.map((warning) => warning.code)).toEqual([
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
});
