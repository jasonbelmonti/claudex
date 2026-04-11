import { expect, test } from "bun:test";

import { createClaudeIngestRegistries } from "../../src/ingest/claude";
import {
  createClaudeArtifactNormalizationContext,
  createClaudeArtifactNormalizationMetadata,
  getClaudeArtifactWorkingDirectory,
  normalizeClaudeArtifactRecord,
} from "../../src/ingest/claude/normalize";

function expectSingleClaudeEvent(
  record: unknown,
  context?: ReturnType<typeof createClaudeArtifactNormalizationContext>,
) {
  const normalized = normalizeClaudeArtifactRecord(record, context);

  expect(normalized.warnings).toEqual([]);
  expect(normalized.events).toHaveLength(1);

  const [event] = normalized.events;
  if (!event) {
    throw new Error("Expected exactly one normalized Claude event.");
  }

  return event;
}

function expectUnsupportedClaudeRecord(record: unknown, message: string) {
  const normalized = normalizeClaudeArtifactRecord(record);

  expect(normalized.events).toEqual([]);
  expect(normalized.warnings).toEqual([
    {
      code: "unsupported-record",
      message,
      raw: record,
    },
  ]);
}

test("normalizes Claude auth status payloads emitted by replay artifacts", () => {
  const normalized = normalizeClaudeArtifactRecord({
    type: "auth_status",
    session_id: "session-1",
    isAuthenticating: false,
    output: ["Waiting for browser confirmation"],
    error: "Authentication failed",
  });

  expect(normalized.warnings).toEqual([]);
  expect(normalized.events).toHaveLength(1);
  expect(normalized.events[0]).toMatchObject({
    type: "auth.status",
    provider: "claude",
    session: {
      provider: "claude",
      sessionId: "session-1",
    },
    status: "failed",
    detail: "Waiting for browser confirmation\nAuthentication failed",
  });
});

test("normalizes supported Claude lifecycle replay records", () => {
  const cases = [
    {
      record: {
        type: "system",
        subtype: "status",
        session_id: "session-1",
        status: "compacting",
        permissionMode: "plan",
      },
      expected: {
        type: "status",
        status: "compacting",
        detail: "plan",
      },
    },
    {
      record: {
        type: "system",
        subtype: "files_persisted",
        session_id: "session-1",
        files: [{ filename: "README.md" }],
        failed: [{ filename: "draft.md", error: "permission denied" }],
      },
      expected: {
        type: "file.changed",
        changes: [{ path: "README.md", changeType: "update" }],
        outcome: "error",
        extensions: {
          failed: [{ path: "draft.md", error: "permission denied" }],
        },
      },
    },
    {
      record: {
        type: "system",
        subtype: "task_started",
        session_id: "session-1",
        task_id: "task-1",
        tool_use_id: "tool-1",
        description: "Review repository",
        prompt: "Review repository",
        task_type: "task",
      },
      expected: {
        type: "tool.started",
        toolCallId: "tool-1",
        toolName: "task",
        kind: "custom",
        input: {
          description: "Review repository",
          prompt: "Review repository",
        },
        extensions: {
          taskId: "task-1",
        },
      },
    },
    {
      record: {
        type: "tool_progress",
        session_id: "session-1",
        tool_use_id: "tool-1",
        tool_name: "Read",
        parent_tool_use_id: "parent-1",
        task_id: "task-1",
        elapsed_time_seconds: 3,
      },
      expected: {
        type: "tool.updated",
        toolCallId: "tool-1",
        statusText: "in_progress",
        output: {
          elapsedTimeSeconds: 3,
        },
        extensions: {
          parentToolUseId: "parent-1",
          taskId: "task-1",
          toolName: "Read",
        },
      },
    },
    {
      record: {
        type: "system",
        subtype: "task_progress",
        session_id: "session-1",
        task_id: "task-1",
        tool_use_id: "tool-1",
        description: "Still reviewing",
        usage: {
          total_tokens: 100,
        },
        last_tool_name: "Read",
      },
      expected: {
        type: "tool.updated",
        toolCallId: "tool-1",
        statusText: "Still reviewing",
        output: {
          usage: {
            total_tokens: 100,
          },
          lastToolName: "Read",
        },
        extensions: {
          taskId: "task-1",
        },
      },
    },
    {
      record: {
        type: "system",
        subtype: "task_notification",
        session_id: "session-1",
        task_id: "task-1",
        tool_use_id: "tool-1",
        status: "completed",
        summary: "Done",
        output_file: "out.txt",
        usage: {
          total_tokens: 100,
        },
      },
      expected: {
        type: "tool.completed",
        toolCallId: "tool-1",
        toolName: "task",
        kind: "custom",
        outcome: "success",
        output: {
          summary: "Done",
          outputFile: "out.txt",
          usage: {
            total_tokens: 100,
          },
        },
        extensions: {
          taskId: "task-1",
        },
      },
    },
  ] as const;

  for (const { record, expected } of cases) {
    const normalized = normalizeClaudeArtifactRecord(record);
    expect(normalized.warnings).toEqual([]);
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0]).toMatchObject({
      provider: "claude",
      session: {
        provider: "claude",
        sessionId: "session-1",
      },
      ...expected,
    });
  }

  const initRecord = normalizeClaudeArtifactRecord({
    type: "system",
    subtype: "init",
    session_id: "session-1",
  });

  expect(initRecord.events).toEqual([]);
  expect(initRecord.warnings).toEqual([]);
});

test("normalizes Claude user records into turn.started events", () => {
  const cases = [
    {
      content: "Inspect the repo",
      expectedPrompt: "Inspect the repo",
    },
    {
      content: [
        {
          type: "text",
          text: "Inspect the repo",
        },
      ],
      expectedPrompt: "Inspect the repo",
    },
    {
      content: [
        {
          type: "tool_result",
          tool_use_id: "tool-1",
          content: "ignored",
        },
      ],
      expectedPrompt: "",
    },
  ] as const;

  for (const { content, expectedPrompt } of cases) {
    const record = {
      type: "user",
      sessionId: "session-1",
      uuid: "user-1",
      timestamp: "2026-04-03T12:00:00.000Z",
      cwd: "/tmp/claudex",
      message: {
        role: "user",
        content,
      },
    };
    const normalized = normalizeClaudeArtifactRecord(record);

    expect(normalized.warnings).toEqual([]);
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0]).toMatchObject({
      type: "turn.started",
      provider: "claude",
      session: {
        provider: "claude",
        sessionId: "session-1",
      },
      input: {
        prompt: expectedPrompt,
      },
      timestamp: "2026-04-03T12:00:00.000Z",
      raw: record,
      extensions: {
        cwd: "/tmp/claudex",
      },
    });
  }
});

test("preserves Claude result cost and model usage metadata during replay", () => {
  const normalized = normalizeClaudeArtifactRecord({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "Hello world",
    usage: {
      input_tokens: 3,
      output_tokens: 5,
      cache_read_input_tokens: 4,
      cache_creation_input_tokens: 2,
      service_tier: "standard",
    },
    total_cost_usd: 0.05,
    modelUsage: {
      api: {
        input_tokens: 3,
      },
    },
  });

  expect(normalized.warnings).toEqual([]);
  expect(normalized.events).toHaveLength(1);
  expect(normalized.events[0]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Hello world",
      usage: {
        tokens: {
          input: 3,
          output: 5,
          cachedInput: 4,
        },
        costUsd: 0.05,
        providerUsage: {
          cacheCreationInputTokens: 2,
          serviceTier: "standard",
          modelUsage: {
            api: {
              input_tokens: 3,
            },
          },
        },
      },
    },
  });
});

test("serializes Claude structured output when replayed success results omit terminal text", () => {
  const normalized = normalizeClaudeArtifactRecord({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "",
    structured_output: {
      status: "ok",
    },
    usage: {
      input_tokens: 3,
      output_tokens: 5,
    },
  });

  expect(normalized.warnings).toEqual([]);
  expect(normalized.events).toHaveLength(1);
  expect(normalized.events[0]).toMatchObject({
    type: "turn.completed",
    result: {
      text: JSON.stringify({ status: "ok" }),
      structuredOutput: {
        status: "ok",
      },
      usage: {
        tokens: {
          input: 3,
          output: 5,
        },
      },
    },
  });
});

test("replayed success results fall back to the latest assistant text when terminal text is empty", () => {
  const context = createClaudeArtifactNormalizationContext();

  const assistant = normalizeClaudeArtifactRecord({
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
  }, context);

  const result = normalizeClaudeArtifactRecord({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "",
    usage: {
      input_tokens: 1,
      output_tokens: 2,
    },
  }, context);

  expect(assistant.events).toHaveLength(1);
  expect(result.warnings).toEqual([]);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Assistant fallback",
      usage: {
        tokens: {
          input: 1,
          output: 2,
        },
      },
    },
  });
});

test("successful replay results allow missing usage metadata", () => {
  const normalized = normalizeClaudeArtifactRecord({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "done",
  });

  expect(normalized.warnings).toEqual([]);
  expect(normalized.events).toHaveLength(1);
  expect(normalized.events[0]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "done",
      usage: null,
    },
  });
});

test("maps Claude replay error results without requiring usage metadata", () => {
  const cases = [
    {
      record: {
        type: "result",
        subtype: "error_max_structured_output_retries",
        session_id: "session-1",
        errors: ["bad json"],
      },
      code: "structured_output_invalid",
      message: "bad json",
    },
    {
      record: {
        type: "result",
        subtype: "error_permission_denied",
        session_id: "session-1",
        errors: ["permission denied"],
        permission_denials: [{ tool_name: "Write" }],
      },
      code: "permission_denied",
      message: "permission denied",
    },
  ] as const;

  for (const { record, code, message } of cases) {
    const normalized = normalizeClaudeArtifactRecord(record);

    expect(normalized.warnings).toEqual([]);
    expect(normalized.events).toHaveLength(1);
    expect(normalized.events[0]).toMatchObject({
      type: "turn.failed",
      error: expect.objectContaining({
        code,
        message,
      }),
    });
  }
});

test("restores persisted Claude normalization context and preserves only active session state", () => {
  const context = createClaudeArtifactNormalizationContext({
    claudePendingAssistantTexts: {
      "session-1": "Cached assistant reply",
      "session-2": {
        latestAssistantText: "Pending assistant reply",
        workingDirectory: "/sanitized/worktree",
      },
      ignored: 42,
    },
  });

  expect(createClaudeArtifactNormalizationMetadata(
    createClaudeArtifactNormalizationContext(),
  )).toBeUndefined();
  expect(createClaudeArtifactNormalizationMetadata({
    sessions: new Map([["ignored", {}]]),
  })).toBeUndefined();
  expect(getClaudeArtifactWorkingDirectory(context, "session-2")).toBe(
    "/sanitized/worktree",
  );

  const userEvent = expectSingleClaudeEvent({
    type: "user",
    session_id: "session-2",
    timestamp: "2026-04-11T12:00:00.000Z",
    message: {
      role: "user",
      content: "Reuse the sanitized cwd",
    },
  }, context);
  const resultEvent = expectSingleClaudeEvent({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "",
    usage: {
      input_tokens: 1,
      output_tokens: 2,
    },
  }, context);

  expect(userEvent).toMatchObject({
    type: "turn.started",
    extensions: {
      cwd: "/sanitized/worktree",
    },
  });
  expect(resultEvent).toMatchObject({
    type: "turn.completed",
    result: {
      text: "Cached assistant reply",
    },
  });
  expect(createClaudeArtifactNormalizationMetadata(context)).toEqual({
    claudePendingAssistantTexts: {
      "session-2": {
        latestAssistantText: "Pending assistant reply",
        workingDirectory: "/sanitized/worktree",
      },
    },
  });
});

test("surfaces unsupported Claude replay shapes as explicit warnings", () => {
  const cases = [
    {
      record: { hello: "world" },
      message: "Skipped malformed Claude record.",
    },
    {
      record: {
        type: "assistant",
        session_id: "session-1",
        message: {
          content: [{ type: "tool_result", tool_use_id: "tool-1" }],
        },
      },
      message: "Claude assistant record is missing renderable text.",
    },
    {
      record: {
        type: "stream_event",
        session_id: "session-1",
        event: {
          type: "message_start",
        },
      },
      message: "Unsupported Claude stream event payload.",
    },
    {
      record: {
        type: "stream_event",
        session_id: "session-1",
        event: {
          type: "content_block_delta",
          delta: {
            type: "input_json_delta",
          },
        },
      },
      message: "Unsupported Claude stream delta payload.",
    },
    {
      record: {
        type: "auth_status",
        session_id: "session-1",
      },
      message: "Unsupported Claude auth status payload.",
    },
    {
      record: {
        type: "tool_progress",
        session_id: "session-1",
      },
      message: "Unsupported Claude tool progress payload.",
    },
    {
      record: {
        type: "system",
        subtype: "files_persisted",
        session_id: "session-1",
        files: [{ nope: true }],
        failed: [{ filename: "" }],
      },
      message: "Unsupported Claude system payload.",
    },
    {
      record: {
        type: "mystery",
        session_id: "session-1",
      },
      message: "Unsupported Claude event type: mystery",
    },
  ] as const;

  for (const { record, message } of cases) {
    expectUnsupportedClaudeRecord(record, message);
  }
});

test("normalizes Claude lifecycle fallback variants and alternate task outcomes", () => {
  const authReadyEvent = expectSingleClaudeEvent({
    type: "auth_status",
    session_id: "session-1",
    output: ["Browser ready"],
    detail: "Ready to continue",
  });
  const authNeedsAuthEvent = expectSingleClaudeEvent({
    type: "auth_status",
    session_id: "session-1",
    status: "needs-auth",
    detail: "Reauthenticate",
  });
  const filesPersistedEvent = expectSingleClaudeEvent({
    type: "system",
    subtype: "files_persisted",
    session_id: "session-1",
    failed: [{ filename: "draft.md" }],
  });
  const taskStartedEvent = expectSingleClaudeEvent({
    type: "system",
    subtype: "task_started",
    session_id: "session-1",
    task_id: "task-1",
  });
  const taskProgressEvent = expectSingleClaudeEvent({
    type: "system",
    subtype: "task_progress",
    session_id: "session-1",
    task_id: "task-1",
    last_tool_name: "Read",
    usage: "ignored",
  });
  const taskStoppedEvent = expectSingleClaudeEvent({
    type: "system",
    subtype: "task_notification",
    session_id: "session-1",
    task_id: "task-1",
    status: "stopped",
  });
  const taskErroredEvent = expectSingleClaudeEvent({
    type: "system",
    subtype: "task_notification",
    session_id: "session-1",
    task_id: "task-1",
    status: "failed",
  });

  expect(authReadyEvent).toMatchObject({
    type: "auth.status",
    status: "ready",
    detail: "Browser ready",
  });
  expect(authNeedsAuthEvent).toMatchObject({
    type: "auth.status",
    status: "needs-auth",
    detail: "Reauthenticate",
  });
  expect(filesPersistedEvent).toMatchObject({
    type: "file.changed",
    changes: [],
    outcome: "error",
    extensions: {
      failed: [{ path: "draft.md" }],
    },
  });
  expect(taskStartedEvent).toMatchObject({
    type: "tool.started",
    toolCallId: "task-1",
    toolName: "task",
    kind: "custom",
  });
  expect(taskStartedEvent.type).toBe("tool.started");
  if (taskStartedEvent.type !== "tool.started") {
    throw new Error("Expected Claude task_started payload to normalize.");
  }

  expect(taskStartedEvent.input).toBeUndefined();
  expect(taskProgressEvent).toMatchObject({
    type: "tool.updated",
    toolCallId: "task-1",
    output: {
      lastToolName: "Read",
    },
  });
  expect(taskStoppedEvent).toMatchObject({
    type: "tool.completed",
    outcome: "cancelled",
  });
  expect(taskErroredEvent).toMatchObject({
    type: "tool.completed",
    outcome: "error",
  });
});

test("normalizes Claude result stringification, provider-failure defaults, and parser failures", () => {
  const circularStructuredOutput = {
    toString() {
      return "[sanitized structured output]";
    },
  } as { self?: unknown; toString(): string };
  circularStructuredOutput.self = circularStructuredOutput;

  const structuredString = normalizeClaudeArtifactRecord({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "",
    structured_output: "already serialized",
    usage: {},
  });
  const structuredFallback = normalizeClaudeArtifactRecord({
    type: "result",
    subtype: "success",
    session_id: "session-1",
    result: "   ",
    structured_output: circularStructuredOutput,
    usage: {},
  });
  const providerFailure = normalizeClaudeArtifactRecord({
    type: "result",
    subtype: "error_internal",
    session_id: "session-1",
    errors: [42],
    permission_denials: "ignored",
  });
  const throwingRecord = {
    type: "assistant",
    get message() {
      throw new Error("kaboom");
    },
  };
  const parseFailure = normalizeClaudeArtifactRecord(throwingRecord);

  expect(structuredString.events[0]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "already serialized",
      usage: null,
    },
  });
  expect(structuredFallback.events[0]).toMatchObject({
    type: "turn.completed",
    result: {
      text: "[sanitized structured output]",
      usage: null,
    },
  });
  expect(providerFailure.events[0]).toMatchObject({
    type: "turn.failed",
    error: expect.objectContaining({
      code: "provider_failure",
      message: "Claude returned a result error.",
      details: {
        subtype: "error_internal",
        permissionDenials: [],
      },
    }),
  });
  expect(parseFailure.events).toEqual([]);
  expect(parseFailure.warnings).toHaveLength(1);
  expect(parseFailure.warnings[0]).toMatchObject({
    code: "parse-failed",
    message: "Claude artifact record parsing failed.",
  });
});

test("exposes Claude snapshot and transcript registries in stable order", () => {
  const registries = createClaudeIngestRegistries();
  const root = {
    provider: "claude" as const,
    path: "/tmp/claude",
  };

  expect(registries).toHaveLength(2);
  expect(registries[0]?.provider).toBe("claude");
  expect(registries[0]?.matchFile("/tmp/snapshot.json", root)).toEqual({
    kind: "snapshot",
  });
  expect(registries[0]?.matchFile("/tmp/transcript.jsonl", root)).toBeNull();
  expect(registries[1]?.provider).toBe("claude");
  expect(registries[1]?.matchFile("/tmp/transcript.jsonl", root)).toEqual({
    kind: "transcript",
  });
  expect(registries[1]?.matchFile("/tmp/snapshot.json", root)).toBeNull();
});
