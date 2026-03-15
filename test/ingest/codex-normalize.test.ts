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

test("mirrored assistant and reasoning records collapse to single semantic events", () => {
  const context = createCodexTranscriptNormalizationContext();
  const assistantText = "Mirror once, not twice.";
  const reasoningText = "Collapsed reasoning summary.";

  normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-15T14:29:00.000Z",
      type: "session_meta",
      payload: {
        id: "session-bel-392",
      },
    },
    context,
  );

  normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-15T14:29:01.000Z",
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-bel-392",
      },
    },
    context,
  );

  normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-15T14:29:02.000Z",
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "Verify BEL-392",
      },
    },
    context,
  );

  const assistantFromEvent = normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-15T14:29:03.000Z",
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: assistantText,
        phase: "commentary",
      },
    },
    context,
  );

  const assistantFromResponseItem = normalizeCodexTranscriptRecord(
    {
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
    },
    context,
  );

  const reasoningFromEvent = normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-15T14:29:03.200Z",
      type: "event_msg",
      payload: {
        type: "agent_reasoning",
        text: reasoningText,
      },
    },
    context,
  );

  const reasoningFromResponseItem = normalizeCodexTranscriptRecord(
    {
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
    },
    context,
  );

  const completed = normalizeCodexTranscriptRecord(
    {
      timestamp: "2026-03-15T14:29:04.000Z",
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-bel-392",
        last_agent_message: assistantText,
      },
    },
    context,
  );

  expect(assistantFromEvent.events).toHaveLength(1);
  expect(assistantFromEvent.events[0]).toMatchObject({
    type: "message.completed",
    text: assistantText,
  });
  expect(assistantFromResponseItem.events).toEqual([]);

  expect(reasoningFromEvent.events).toHaveLength(1);
  expect(reasoningFromEvent.events[0]).toMatchObject({
    type: "reasoning.summary",
    summary: reasoningText,
  });
  expect(reasoningFromResponseItem.events).toEqual([]);

  expect(completed.events).toHaveLength(1);
  expect(completed.events[0]?.type).toBe("turn.completed");
  if (completed.events[0]?.type !== "turn.completed") {
    throw new Error("Expected Codex turn completion event.");
  }

  expect(completed.events[0].result.text).toBe(assistantText);
});
