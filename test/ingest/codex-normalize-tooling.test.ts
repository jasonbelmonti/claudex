import { expect, test } from "#test-support";

import {
  createCodexTranscriptNormalizationContext,
  normalizeCodexTranscriptRecord,
} from "../../src/ingest/codex/normalize.js";
import {
  createSyntheticToolCallId,
  createToolDescriptor,
  extractUsageSnapshot,
  inferToolOutcome,
  mapUsageSnapshot,
} from "../../src/ingest/codex/normalize-helpers.js";

test("tool helpers classify descriptors, outcomes, and usage snapshots", () => {
  expect(
    createToolDescriptor({
      name: "mcp__github__search_issues",
      input: { q: "Codex audit" },
    }),
  ).toEqual({
    toolName: "search_issues",
    kind: "mcp",
    input: { q: "Codex audit" },
    extensions: {
      server: "github",
    },
  });

  expect(
    createToolDescriptor({
      name: "exec_command",
      input: { cmd: "bun test" },
    }),
  ).toEqual({
    toolName: "command_execution",
    kind: "command",
    input: { cmd: "bun test" },
  });

  expect(
    createToolDescriptor({
      name: "workspace-write",
      input: { path: "docs/report.md" },
    }),
  ).toEqual({
    toolName: "workspace-write",
    kind: "custom",
    input: { path: "docs/report.md" },
  });

  expect(
    inferToolOutcome({
      metadata: {
        exit_code: 2,
      },
      output: "command failed",
    }),
  ).toEqual({
    outcome: "error",
    errorMessage: "command failed",
  });

  expect(
    inferToolOutcome({
      metadata: {
        exit_code: 9,
      },
    }),
  ).toEqual({
    outcome: "error",
    errorMessage: "Tool exited with code 9.",
  });

  expect(
    inferToolOutcome({
      error: {
        message: "rate limited",
      },
    }),
  ).toEqual({
    outcome: "error",
    errorMessage: "rate limited",
  });

  expect(
    inferToolOutcome({
      error: "plain error",
    }),
  ).toEqual({
    outcome: "error",
    errorMessage: "plain error",
  });

  expect(inferToolOutcome("Execution error: timeout")).toEqual({
    outcome: "error",
    errorMessage: "Execution error: timeout",
  });

  expect(inferToolOutcome({ ok: true })).toEqual({
    outcome: "success",
  });

  const syntheticContext = createCodexTranscriptNormalizationContext();
  expect(createSyntheticToolCallId(syntheticContext, "web_search")).toBe(
    "web_search-1",
  );
  expect(createSyntheticToolCallId(syntheticContext, "web_search")).toBe(
    "web_search-2",
  );

  expect(extractUsageSnapshot(null)).toBeNull();
  expect(
    extractUsageSnapshot({
      total_token_usage: {
        input_tokens: 12,
        cached_input_tokens: 4,
        output_tokens: 8,
        reasoning_output_tokens: 2,
        total_tokens: 20,
      },
      model_context_window: 258_400,
    }),
  ).toEqual({
    input_tokens: 12,
    cached_input_tokens: 4,
    output_tokens: 8,
    reasoning_output_tokens: 2,
    total_tokens: 20,
    model_context_window: 258_400,
  });

  expect(
    extractUsageSnapshot({
      last_token_usage: {
        input_tokens: 7,
        output_tokens: 5,
      },
    }),
  ).toEqual({
    input_tokens: 7,
    output_tokens: 5,
    cached_input_tokens: undefined,
    reasoning_output_tokens: undefined,
    total_tokens: undefined,
    model_context_window: undefined,
  });

  expect(
    extractUsageSnapshot({
      total_token_usage: {
        input_tokens: 5,
      },
    }),
  ).toBeNull();

  expect(mapUsageSnapshot(null)).toBeNull();
  expect(
    mapUsageSnapshot({
      input_tokens: 12,
      output_tokens: 8,
      cached_input_tokens: 4,
      reasoning_output_tokens: 2,
      total_tokens: 20,
      model_context_window: 258_400,
    }),
  ).toEqual({
    tokens: {
      input: 12,
      output: 8,
      cachedInput: 4,
    },
    providerUsage: {
      reasoningOutputTokens: 2,
      totalTokens: 20,
      modelContextWindow: 258_400,
    },
  });
});

test("function call normalization covers descriptors, unsupported payloads, and outcome fallbacks", () => {
  const context = createCodexTranscriptNormalizationContext();

  normalizeCodexTranscriptRecord(
    {
      type: "session_meta",
      payload: {
        id: "session-tooling",
      },
    },
    context,
  );
  normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-tooling",
      },
    },
    context,
  );

  const commandStarted = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "exec_command",
        arguments:
          "{\"cmd\":\"bun test test/ingest/codex-transcript-parser.test.ts\",\"workdir\":\"/tmp/live-fixture\"}",
        call_id: "call-command",
      },
    },
    context,
  );

  expect(commandStarted.events[0]).toMatchObject({
    type: "tool.started",
    toolCallId: "call-command",
    toolName: "command_execution",
    kind: "command",
    input: {
      cmd: "bun test test/ingest/codex-transcript-parser.test.ts",
      workdir: "/tmp/live-fixture",
    },
  });

  const commandCompleted = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-command",
        output:
          "{\"output\":\"command failed\",\"metadata\":{\"exit_code\":2}}",
      },
    },
    context,
  );

  expect(commandCompleted.events[0]).toMatchObject({
    type: "tool.completed",
    toolCallId: "call-command",
    toolName: "command_execution",
    kind: "command",
    outcome: "error",
    errorMessage: "command failed",
    output: {
      output: "command failed",
      metadata: {
        exit_code: 2,
      },
    },
  });
  expect(context.pendingToolCalls.size).toBe(0);

  const mcpStarted = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "mcp__github__search_issues",
        arguments: "{\"q\":\"branch expansion\"}",
        call_id: "call-mcp",
      },
    },
    context,
  );

  expect(mcpStarted.events[0]).toMatchObject({
    type: "tool.started",
    toolCallId: "call-mcp",
    toolName: "search_issues",
    kind: "mcp",
    extensions: {
      server: "github",
    },
  });

  const orphanedOutput = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-orphan",
        output: "{\"error\":\"plain error\"}",
      },
    },
    context,
  );

  expect(orphanedOutput.events[0]).toMatchObject({
    type: "tool.completed",
    toolCallId: "call-orphan",
    toolName: "unknown",
    kind: "unknown",
    outcome: "error",
    errorMessage: "plain error",
  });

  const mcpCompleted = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: "call-mcp",
        output: "{\"error\":{\"message\":\"rate limited\"}}",
      },
    },
    context,
  );

  expect(mcpCompleted.events[0]).toMatchObject({
    type: "tool.completed",
    toolCallId: "call-mcp",
    toolName: "search_issues",
    kind: "mcp",
    outcome: "error",
    errorMessage: "rate limited",
  });

  const missingFunctionCall = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "function_call",
        arguments: "{}",
      },
    },
    context,
  );

  expect(missingFunctionCall.events).toEqual([]);
  expect(missingFunctionCall.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex function_call payload is missing call_id or name.",
  });

  const missingFunctionCallOutput = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        output: "{\"output\":\"missing call id\"}",
      },
    },
    context,
  );

  expect(missingFunctionCallOutput.events).toEqual([]);
  expect(missingFunctionCallOutput.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex function_call_output payload is missing call_id.",
  });
});

test("custom tool and web search normalization cover missing identifiers, pending reuse, and synthetic completion", () => {
  const context = createCodexTranscriptNormalizationContext();

  normalizeCodexTranscriptRecord(
    {
      type: "session_meta",
      payload: {
        id: "session-custom-tooling",
      },
    },
    context,
  );
  normalizeCodexTranscriptRecord(
    {
      type: "event_msg",
      payload: {
        type: "task_started",
        turn_id: "turn-custom-tooling",
      },
    },
    context,
  );

  const missingCustomToolCall = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "workspace-write",
      },
    },
    context,
  );

  expect(missingCustomToolCall.events).toEqual([]);
  expect(missingCustomToolCall.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex custom_tool_call payload is missing call_id or name.",
  });

  const customToolStarted = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "workspace-write",
        input: "{\"path\":\"docs/report.md\"}",
        call_id: "call-custom",
      },
    },
    context,
  );

  expect(customToolStarted.events[0]).toMatchObject({
    type: "tool.started",
    toolCallId: "call-custom",
    toolName: "workspace-write",
    kind: "custom",
    input: {
      path: "docs/report.md",
    },
  });

  const customToolCompleted = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        call_id: "call-custom",
        output: "{\"error\":{\"message\":\"denied\"}}",
      },
    },
    context,
  );

  expect(customToolCompleted.events[0]).toMatchObject({
    type: "tool.completed",
    toolCallId: "call-custom",
    toolName: "workspace-write",
    kind: "custom",
    outcome: "error",
    errorMessage: "denied",
  });

  const missingCustomToolOutput = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call_output",
        output: "{\"ok\":true}",
      },
    },
    context,
  );

  expect(missingCustomToolOutput.events).toEqual([]);
  expect(missingCustomToolOutput.warnings[0]).toMatchObject({
    code: "unsupported-record",
    message: "Codex custom_tool_call_output payload is missing call_id.",
  });

  const explicitSearch = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "in_progress",
        query: "explicit search",
        call_id: "search-explicit",
      },
    },
    context,
  );

  expect(explicitSearch.events[0]).toMatchObject({
    type: "tool.started",
    toolCallId: "search-explicit",
    toolName: "web_search",
    kind: "custom",
  });

  const startedAlpha = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "in_progress",
        query: "alpha",
      },
    },
    context,
  );
  const startedBeta = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "in_progress",
        query: "beta",
      },
    },
    context,
  );

  const completedReuse = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "completed",
        query: "beta",
      },
    },
    context,
  );

  expect(startedAlpha.events[0]).toMatchObject({
    type: "tool.started",
    toolCallId: "web_search-1",
  });
  expect(startedBeta.events[0]).toMatchObject({
    type: "tool.started",
    toolCallId: "web_search-2",
  });
  expect(completedReuse.events[0]).toMatchObject({
    type: "tool.completed",
    toolCallId: "web_search-2",
    output: {
      query: "beta",
    },
  });

  normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "completed",
        query: "explicit search",
        call_id: "search-explicit",
      },
    },
    context,
  );

  normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "completed",
        query: "alpha",
        call_id: "web_search-1",
      },
    },
    context,
  );

  normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "custom_tool_call",
        name: "workspace-read",
        input: "{\"path\":\"README.md\"}",
        call_id: "call-other-tool",
      },
    },
    context,
  );

  const completedSynthetic = normalizeCodexTranscriptRecord(
    {
      type: "response_item",
      payload: {
        type: "web_search_call",
        status: "completed",
      },
    },
    context,
  );

  expect(completedSynthetic.events[0]).toMatchObject({
    type: "tool.completed",
    toolCallId: "web_search-3",
    toolName: "web_search",
    kind: "custom",
    outcome: "success",
  });
  expect(completedSynthetic.events[0]?.type).toBe("tool.completed");
  if (completedSynthetic.events[0]?.type !== "tool.completed") {
    throw new Error("Expected a completed web_search event.");
  }

  expect(completedSynthetic.events[0].output).toBeUndefined();
  expect(context.pendingToolCalls.has("search-explicit")).toBeFalsy();
  expect(context.pendingToolCalls.has("call-other-tool")).toBeTruthy();
});
