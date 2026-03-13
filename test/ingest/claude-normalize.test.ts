import { expect, test } from "bun:test";

import {
  createClaudeArtifactNormalizationContext,
  normalizeClaudeArtifactRecord,
} from "../../src/ingest/claude/normalize";

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
