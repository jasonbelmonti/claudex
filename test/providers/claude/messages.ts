import type { UUID } from "crypto";

import type {
  SDKAssistantMessage,
  SDKAuthStatusMessage,
  SDKFilesPersistedEvent,
  SDKPartialAssistantMessage,
  SDKResultSuccess,
  SDKStatusMessage,
  SDKSystemMessage,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
  SDKToolProgressMessage,
} from "@anthropic-ai/claude-agent-sdk";

let uuidCounter = 0;

function createUuid(): UUID {
  uuidCounter += 1;

  return `00000000-0000-4000-8000-${uuidCounter
    .toString()
    .padStart(12, "0")}` as UUID;
}

export function createInitMessage(
  sessionId: string,
  overrides: Partial<SDKSystemMessage> = {},
): SDKSystemMessage {
  return {
    type: "system",
    subtype: "init",
    session_id: sessionId,
    uuid: createUuid(),
    cwd: "/tmp",
    tools: [],
    mcp_servers: [],
    model: "claude-sonnet-4-6",
    permissionMode: "plan",
    slash_commands: [],
    apiKeySource: "user",
    claude_code_version: "2.1.29",
    output_style: "default",
    skills: [],
    plugins: [],
    ...overrides,
  };
}

export function createAuthStatusMessage(
  sessionId: string,
  output: string[] = ["Authenticated"],
  overrides: Partial<SDKAuthStatusMessage> = {},
): SDKAuthStatusMessage {
  return {
    type: "auth_status",
    session_id: sessionId,
    uuid: createUuid(),
    isAuthenticating: false,
    output,
    ...overrides,
  };
}

export function createStatusMessage(
  sessionId: string,
  overrides: Partial<SDKStatusMessage> = {},
): SDKStatusMessage {
  return {
    type: "system",
    subtype: "status",
    session_id: sessionId,
    uuid: createUuid(),
    status: "compacting",
    permissionMode: "plan",
    ...overrides,
  };
}

export function createTextDeltaMessage(
  sessionId: string,
  text: string,
  overrides: Partial<SDKPartialAssistantMessage> = {},
): SDKPartialAssistantMessage {
  return {
    type: "stream_event",
    session_id: sessionId,
    uuid: createUuid(),
    parent_tool_use_id: null,
    event: {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "text_delta",
        text,
      },
    },
    ...overrides,
  };
}

export function createAssistantMessage(
  sessionId: string,
  text: string,
  overrides: Partial<SDKAssistantMessage> = {},
): SDKAssistantMessage {
  return {
    type: "assistant",
    session_id: sessionId,
    uuid: createUuid(),
    parent_tool_use_id: null,
    message: {
      model: "claude-sonnet-4-6",
      id: `${sessionId}-message`,
      type: "message",
      role: "assistant",
      content: [
        {
          type: "text",
          text,
        },
      ],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: 3,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 4,
        output_tokens: 5,
      },
      context_management: null,
    } as SDKAssistantMessage["message"],
    ...overrides,
  };
}

export function createTaskStartedMessage(
  sessionId: string,
  overrides: Partial<SDKTaskStartedMessage> = {},
): SDKTaskStartedMessage {
  return {
    type: "system",
    subtype: "task_started",
    session_id: sessionId,
    uuid: createUuid(),
    task_id: "task-1",
    description: "Review repository",
    prompt: "Review the repository",
    task_type: "task",
    ...overrides,
  };
}

export function createToolProgressMessage(
  sessionId: string,
  overrides: Partial<SDKToolProgressMessage> = {},
): SDKToolProgressMessage {
  return {
    type: "tool_progress",
    session_id: sessionId,
    uuid: createUuid(),
    tool_use_id: "tool-1",
    tool_name: "Read",
    parent_tool_use_id: null,
    elapsed_time_seconds: 1,
    ...overrides,
  };
}

export function createTaskProgressMessage(
  sessionId: string,
  overrides: Partial<SDKTaskProgressMessage> = {},
): SDKTaskProgressMessage {
  return {
    type: "system",
    subtype: "task_progress",
    session_id: sessionId,
    uuid: createUuid(),
    task_id: "task-1",
    description: "Still reviewing",
    usage: {
      total_tokens: 100,
      tool_uses: 1,
      duration_ms: 100,
    },
    last_tool_name: "Read",
    ...overrides,
  };
}

export function createFilesPersistedMessage(
  sessionId: string,
  overrides: Partial<SDKFilesPersistedEvent> = {},
): SDKFilesPersistedEvent {
  return {
    type: "system",
    subtype: "files_persisted",
    session_id: sessionId,
    uuid: createUuid(),
    files: [
      {
        filename: "README.md",
        file_id: "file-1",
      },
    ],
    failed: [],
    processed_at: "2026-03-09T00:00:00Z",
    ...overrides,
  };
}

export function createTaskNotificationMessage(
  sessionId: string,
  overrides: Partial<SDKTaskNotificationMessage> = {},
): SDKTaskNotificationMessage {
  return {
    type: "system",
    subtype: "task_notification",
    session_id: sessionId,
    uuid: createUuid(),
    task_id: "task-1",
    status: "completed",
    output_file: "/tmp/task-1.txt",
    summary: "Review complete",
    usage: {
      total_tokens: 120,
      tool_uses: 1,
      duration_ms: 120,
    },
    ...overrides,
  };
}

type SuccessResultOptions = {
  structuredOutput?: unknown;
  totalCostUsd?: number;
};

export function createSuccessResultMessage(
  sessionId: string,
  result: string,
  options: SuccessResultOptions = {},
): SDKResultSuccess {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1,
    duration_api_ms: 1,
    num_turns: 1,
    result,
    stop_reason: "end_turn",
    session_id: sessionId,
    total_cost_usd: options.totalCostUsd ?? 0.05,
    usage: {
      input_tokens: 3,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 4,
      output_tokens: 5,
      server_tool_use: {
        web_search_requests: 0,
        web_fetch_requests: 0,
      },
      service_tier: "standard",
      cache_creation: {
        ephemeral_1h_input_tokens: 0,
        ephemeral_5m_input_tokens: 0,
      },
      inference_geo: "",
      iterations: [],
      speed: "standard",
    },
    modelUsage: {},
    permission_denials: [],
    structured_output: options.structuredOutput,
    uuid: createUuid(),
  };
}
