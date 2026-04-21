import { expect, test } from "bun:test";

import {
  createCodexTranscriptNormalizationContext,
  createCodexTranscriptNormalizationMetadata,
  normalizeCodexTranscriptRecord,
} from "../../src/ingest/codex/normalize.js";

test("response_item message and reasoning branches cover missing text, dedupe, developer suppression, and encrypted fallbacks", () => {
  const context = createCodexTranscriptNormalizationContext();

  const userBeforeTask = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Ignored before task start.",
          },
        ],
      },
    },
    context,
  );

  expect(userBeforeTask.events).toEqual([]);
  expect(userBeforeTask.warnings).toEqual([]);

  normalizeCodexTranscriptRecord(
    {
      type: "session_meta",
      payload: {
        id: "session-message-state",
      },
    },
    context,
  );
  normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-message-state",
      },
    },
    context,
  );

  const missingUserText = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [],
      },
    },
    context,
  );

  expect(missingUserText.events).toEqual([]);
  expect(missingUserText.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message:
      "Codex response_item.message user payload is missing renderable text.",
  });

  const startedFromResponseItem = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Line one",
          },
          {
            type: "input_text",
            text: "Line two",
          },
        ],
      },
    },
    context,
  );

  expect(startedFromResponseItem.events[0]).toMatchObject({
    type: "turn.started",
    input: {
      prompt: "Line one\n\nLine two",
    },
  });

  const duplicateStartFromEvent = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "Line one\n\nLine two",
      },
    },
    context,
  );

  expect(duplicateStartFromEvent.events).toEqual([]);

  const missingAssistantText = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [],
      },
    },
    context,
  );

  expect(missingAssistantText.events).toEqual([]);
  expect(missingAssistantText.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message:
      "Codex response_item.message assistant payload is missing renderable text.",
  });

  const assistantMessage = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "First paragraph.",
          },
          {
            type: "output_text",
            text: "Second paragraph.",
          },
        ],
      },
    },
    context,
  );

  expect(assistantMessage.events[0]).toMatchObject({
    type: "message.completed",
    text: "First paragraph.\n\nSecond paragraph.",
  });

  const duplicateAssistantMessage = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "First paragraph.",
          },
          {
            type: "output_text",
            text: "Second paragraph.",
          },
        ],
      },
    },
    context,
  );

  expect(duplicateAssistantMessage.events).toEqual([]);

  const developerMessage = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "message",
        role: "developer",
        content: [
          {
            type: "input_text",
            text: "Ignored developer instructions",
          },
        ],
      },
    },
    context,
  );

  expect(developerMessage.events).toEqual([]);
  expect(developerMessage.warnings).toEqual([]);

  const encryptedReasoning = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [],
        encrypted_content: "opaque",
      },
    },
    context,
  );

  expect(encryptedReasoning.events).toEqual([]);
  expect(encryptedReasoning.warnings).toEqual([]);

  const missingReasoning = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [],
      },
    },
    context,
  );

  expect(missingReasoning.events).toEqual([]);
  expect(missingReasoning.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex reasoning payload is missing summary text.",
  });

  const reasoningSummary = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [
          {
            type: "summary_text",
            text: "Reason one",
          },
          {
            type: "summary_text",
            text: "Reason two",
          },
        ],
      },
    },
    context,
  );

  expect(reasoningSummary.events[0]).toMatchObject({
    type: "reasoning.summary",
    summary: "Reason one\n\nReason two",
  });

  const duplicateReasoningSummary = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "reasoning",
        summary: [
          {
            type: "summary_text",
            text: "Reason one",
          },
          {
            type: "summary_text",
            text: "Reason two",
          },
        ],
      },
    },
    context,
  );

  expect(duplicateReasoningSummary.events).toEqual([]);
});

test("event and top-level normalization cover state resets, completion, aborts, and unsupported records", () => {
  const context = createCodexTranscriptNormalizationContext();

  const malformedRecord = normalizeCodexTranscriptRecord("bad", context);
  expect(malformedRecord.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Skipped malformed Codex transcript record.",
  });

  const missingSessionId = normalizeCodexTranscriptRecord(
    {
      type: "session_meta",
      payload: {},
    },
    context,
  );
  expect(missingSessionId.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex session_meta record is missing payload.id.",
  });

  const missingEventPayload = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
    },
    context,
  );
  expect(missingEventPayload.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex event_msg record is missing payload.type.",
  });

  const missingResponsePayload = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
    },
    context,
  );
  expect(missingResponsePayload.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex response_item record is missing payload.type.",
  });

  const missingResponsePayloadType = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {},
    },
    context,
  );
  expect(missingResponsePayloadType.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex response_item record is missing payload.type.",
  });

  const unsupportedResponsePayloadType = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "mystery_item",
      },
    },
    context,
  );
  expect(unsupportedResponsePayloadType.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Unsupported Codex response_item payload type: mystery_item.",
  });

  const unsupportedTopLevel = normalizeCodexTranscriptRecord(
    {
      type: "mystery",
      payload: {},
    },
    context,
  );
  expect(unsupportedTopLevel.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Unsupported Codex transcript record type: mystery.",
  });

  normalizeCodexTranscriptRecord(
    {
      type: "session_meta",
      payload: {
        id: "session-state-reset",
      },
    },
    context,
  );

  normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "workspace-write",
        input: "{\"path\":\"docs/audit.md\"}",
        call_id: "call-stale",
      },
    },
    context,
  );

  normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 5,
            output_tokens: 3,
          },
        },
      },
    },
    context,
  );

  const resetOnTaskStarted = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-state-reset",
      },
    },
    context,
  );

  expect(resetOnTaskStarted.events).toEqual([]);
  expect(context.pendingToolCalls.size).toBe(0);
  expect(context.activeTurn).toMatchObject({
    turnId: "turn-state-reset",
    startedEmitted: false,
    latestAssistantText: "",
    usage: null,
  });

  expect(
    normalizeCodexTranscriptRecord(
      {
        type: "event_msg",
        payload: {
          type: "context_compacted",
        },
      },
      context,
    ).events,
  ).toEqual([]);
  expect(
    normalizeCodexTranscriptRecord(
      {
        type: "event_msg",
        payload: {
          type: "item_completed",
        },
      },
      context,
    ).events,
  ).toEqual([]);

  const missingUserMessage = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "user_message",
      },
    },
    context,
  );
  expect(missingUserMessage.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex user_message payload is missing message text.",
  });

  const startedFromEvent = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "user_message",
        message: "Start from event",
      },
    },
    context,
  );
  expect(startedFromEvent.events[0]).toMatchObject({
    type: "turn.started",
    input: {
      prompt: "Start from event",
    },
  });

  const missingAgentMessage = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "agent_message",
      },
    },
    context,
  );
  expect(missingAgentMessage.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex agent_message payload is missing message text.",
  });

  const agentMessage = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: "Event answer",
        phase: "commentary",
      },
    },
    context,
  );
  expect(agentMessage.events[0]).toMatchObject({
    type: "message.completed",
    text: "Event answer",
    extensions: {
      phase: "commentary",
    },
  });

  const duplicateAgentMessage = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "agent_message",
        message: "Event answer",
      },
    },
    context,
  );
  expect(duplicateAgentMessage.events).toEqual([]);

  const missingReasoning = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "agent_reasoning",
      },
    },
    context,
  );
  expect(missingReasoning.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex agent_reasoning payload is missing text.",
  });

  const reasoningEvent = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "agent_reasoning",
        text: "Event reasoning",
      },
    },
    context,
  );
  expect(reasoningEvent.events[0]).toMatchObject({
    type: "reasoning.summary",
    summary: "Event reasoning",
  });

  const duplicateReasoningEvent = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "agent_reasoning",
        text: "Event reasoning",
      },
    },
    context,
  );
  expect(duplicateReasoningEvent.events).toEqual([]);

  expect(
    normalizeCodexTranscriptRecord(
      {
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 1,
            },
          },
        },
      },
      context,
    ).events,
  ).toEqual([]);

  normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 8,
            output_tokens: 13,
            total_tokens: 21,
          },
        },
      },
    },
    context,
  );
  expect(context.activeTurn?.usage).toMatchObject({
    input_tokens: 8,
    output_tokens: 13,
    total_tokens: 21,
  });

  const completed = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "task_complete",
        turn_id: "turn-state-reset",
        last_agent_message: "Fallback answer",
      },
    },
    context,
  );

  expect(completed.events[0]).toMatchObject({
    type: "turn.completed",
    turnId: "turn-state-reset",
    result: {
      text: "Event answer",
      usage: {
        tokens: {
          input: 8,
          output: 13,
        },
        providerUsage: {
          totalTokens: 21,
        },
      },
    },
  });
  expect(context.activeTurn).toBeNull();
  expect(context.pendingToolCalls.size).toBe(0);

  normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-aborted",
      },
    },
    context,
  );
  normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "workspace-write",
        input: "{\"path\":\"docs/stale.md\"}",
        call_id: "call-abort",
      },
    },
    context,
  );

  const aborted = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "turn_aborted",
        turn_id: "turn-aborted",
        reason: "cancelled",
      },
    },
    context,
  );

  expect(aborted.events[0]).toMatchObject({
    type: "turn.failed",
    turnId: "turn-aborted",
    error: {
      code: "aborted",
      message: "Codex turn aborted: cancelled.",
    },
  });
  expect(context.activeTurn).toBeNull();
  expect(context.pendingToolCalls.size).toBe(0);

  normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-aborted-default",
      },
    },
    context,
  );

  const abortedDefault = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "turn_aborted",
      },
    },
    context,
  );

  expect(abortedDefault.events[0]).toMatchObject({
    type: "turn.failed",
    error: {
      code: "aborted",
      message: "Codex turn aborted.",
    },
  });

  const unsupportedPayloadType = normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "unexpected_state",
      },
    },
    context,
  );
  expect(unsupportedPayloadType.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Unsupported Codex event_msg payload type: unexpected_state.",
  });

  const turnContext = normalizeCodexTranscriptRecord(
    {
      type: "turn_context",
      payload: {
        turn_id: "turn-context-only",
      },
    },
    context,
  );
  expect(turnContext.events).toEqual([]);
  expect(context.activeTurn?.turnId).toBe("turn-context-only");

  const blankTurnContext = normalizeCodexTranscriptRecord(
    {
      type: "turn_context",
      payload: {},
    },
    context,
  );
  expect(blankTurnContext.events).toEqual([]);
});

test("normalization state round-trips metadata and drops invalid persisted values", () => {
  const emptyContext = createCodexTranscriptNormalizationContext({
    codexTranscriptNormalizationState: "invalid",
  } as Record<string, unknown>);

  expect(emptyContext).toMatchObject({
    sessionId: null,
    activeTurn: null,
    syntheticToolCallCounter: 0,
  });
  expect(emptyContext.pendingToolCalls.size).toBe(0);
  expect(createCodexTranscriptNormalizationMetadata(emptyContext)).toBeUndefined();

  const restored = createCodexTranscriptNormalizationContext({
    codexTranscriptNormalizationState: {
      sessionId: "session-restored",
      activeTurn: {
        turnId: "turn-restored",
        startedEmitted: true,
        inputPrompt: "Restore this turn.",
        latestAssistantText: "Restored assistant text",
        lastAssistantMessageText: "Restored assistant text",
        lastReasoningText: "Restored reasoning text",
        usage: {
          input_tokens: 12,
          cached_input_tokens: 3,
          output_tokens: 9,
          reasoning_output_tokens: 4,
          total_tokens: 21,
          model_context_window: 258_400,
        },
      },
      pendingToolCalls: {
        "call-good": {
          toolName: "workspace-write",
          kind: "custom",
          input: {
            path: "docs/report.md",
          },
          extensions: {
            phase: "commentary",
          },
        },
        "call-bad-kind": {
          toolName: "mystery",
          kind: "not-a-real-kind",
          input: "raw input",
          extensions: "discard me",
        },
        "call-ignored": "not a record",
      },
      syntheticToolCallCounter: 9,
    },
  } as Record<string, unknown>);

  expect(restored).toMatchObject({
    sessionId: "session-restored",
    activeTurn: {
      turnId: "turn-restored",
      startedEmitted: true,
      inputPrompt: "Restore this turn.",
      latestAssistantText: "Restored assistant text",
      lastAssistantMessageText: "Restored assistant text",
      lastReasoningText: "Restored reasoning text",
      usage: {
        input_tokens: 12,
        cached_input_tokens: 3,
        output_tokens: 9,
        reasoning_output_tokens: 4,
        total_tokens: 21,
        model_context_window: 258_400,
      },
    },
    syntheticToolCallCounter: 9,
  });
  expect(restored.pendingToolCalls.size).toBe(2);
  expect(restored.pendingToolCalls.get("call-good")).toEqual({
    toolName: "workspace-write",
    kind: "custom",
    input: {
      path: "docs/report.md",
    },
    extensions: {
      phase: "commentary",
    },
  });
  expect(restored.pendingToolCalls.get("call-bad-kind")).toEqual({
    toolName: "mystery",
    kind: "unknown",
    input: "raw input",
    extensions: undefined,
  });

  const restoredMetadata = createCodexTranscriptNormalizationMetadata(restored);
  expect(restoredMetadata).toEqual({
    codexTranscriptNormalizationState: {
      sessionId: "session-restored",
      activeTurn: {
        turnId: "turn-restored",
        startedEmitted: true,
        inputPrompt: "Restore this turn.",
        latestAssistantText: "Restored assistant text",
        lastAssistantMessageText: "Restored assistant text",
        lastReasoningText: "Restored reasoning text",
        usage: {
          input_tokens: 12,
          cached_input_tokens: 3,
          output_tokens: 9,
          reasoning_output_tokens: 4,
          total_tokens: 21,
          model_context_window: 258_400,
        },
      },
      pendingToolCalls: {
        "call-good": {
          toolName: "workspace-write",
          kind: "custom",
          input: {
            path: "docs/report.md",
          },
          extensions: {
            phase: "commentary",
          },
        },
        "call-bad-kind": {
          toolName: "mystery",
          kind: "unknown",
          input: "raw input",
        },
      },
      syntheticToolCallCounter: 9,
    },
  });

  const invalidUsage = createCodexTranscriptNormalizationContext({
    codexTranscriptNormalizationState: {
      activeTurn: {
        usage: {
          input_tokens: 1,
        },
      },
    },
  } as Record<string, unknown>);

  expect(invalidUsage.activeTurn).toMatchObject({
    latestAssistantText: "",
    usage: null,
  });
});
