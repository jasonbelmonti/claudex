import { expect, test } from "bun:test";

import {
  createCodexTranscriptNormalizationContext,
  normalizeCodexTranscriptRecord,
} from "../../src/ingest/codex/normalize";

test("web_search completion without call_id reuses the pending synthetic id", () => {
  const context = createCodexTranscriptNormalizationContext();

  const started = normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-14T10:00:00.000Z",
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "in_progress",
        query: "codex transcripts",
      },
    },
    context,
  );

  const completed = normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-14T10:00:01.000Z",
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "completed",
        query: "codex transcripts",
      },
    },
    context,
  );

  expect(started.events).toHaveLength(1);
  expect(completed.events).toHaveLength(1);
  expect(started.events[0]).toMatchObject({
    type: "tool.started",
    toolName: "web_search",
  });
  expect(completed.events[0]).toMatchObject({
    type: "tool.completed",
    toolName: "web_search",
  });
  expect(started.events[0]?.type).toBe("tool.started");
  expect(completed.events[0]?.type).toBe("tool.completed");
  if (started.events[0]?.type !== "tool.started" || completed.events[0]?.type !== "tool.completed") {
    throw new Error("Expected web_search tool events.");
  }

  expect(completed.events[0].toolCallId).toBe(started.events[0].toolCallId);
  expect(context.pendingToolCalls.size).toBe(0);
});

test("session_meta resets stale turn and pending tool state", () => {
  const context = createCodexTranscriptNormalizationContext();

  normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-14T10:00:00.000Z",
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-1",
      },
    },
    context,
  );
  normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-14T10:00:01.000Z",
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "in_progress",
        query: "stale pending tool",
      },
    },
    context,
  );

  expect(context.activeTurn).not.toBeNull();
  expect(context.pendingToolCalls.size).toBe(1);
  expect(context.syntheticToolCallCounter).toBe(1);

  const sessionStarted = normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-14T10:00:02.000Z",
      type: "session_meta",
      payload: {
        id: "session-2",
      },
    },
    context,
  );

  expect(sessionStarted.events).toHaveLength(1);
  expect(sessionStarted.events[0]).toMatchObject({
    type: "session.started",
    reference: {
      sessionId: "session-2",
    },
  });
  expect(context.sessionId).toBe("session-2");
  expect(context.activeTurn).toBeNull();
  expect(context.pendingToolCalls.size).toBe(0);
  expect(context.syntheticToolCallCounter).toBe(0);
});
