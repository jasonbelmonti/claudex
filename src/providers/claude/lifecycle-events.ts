import type {
  SDKAuthStatusMessage,
  SDKFilesPersistedEvent,
  SDKMessage,
  SDKStatusMessage,
  SDKTaskNotificationMessage,
  SDKTaskProgressMessage,
  SDKTaskStartedMessage,
  SDKToolProgressMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { AgentEvent } from "../../core/events";
import type { SessionReference } from "../../core/session";

export function mapClaudeAuthStatusEvent(
  message: SDKAuthStatusMessage,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "auth.status",
    provider: "claude",
    session,
    status: message.isAuthenticating
      ? "authenticating"
      : message.error
        ? "failed"
        : "ready",
    detail: [...message.output, ...(message.error ? [message.error] : [])]
      .filter(Boolean)
      .join("\n"),
    raw: message,
  };
}

export function mapClaudeToolProgressEvent(
  message: SDKToolProgressMessage,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "tool.updated",
    provider: "claude",
    session,
    toolCallId: message.tool_use_id,
    statusText: "in_progress",
    output: {
      elapsedTimeSeconds: message.elapsed_time_seconds,
    },
    raw: message,
    extensions: {
      parentToolUseId: message.parent_tool_use_id,
      taskId: message.task_id,
      toolName: message.tool_name,
    },
  };
}

export function mapClaudeSystemMessageEvents(
  message: Extract<SDKMessage, { type: "system" }>,
  session: SessionReference | null,
): AgentEvent[] {
  switch (message.subtype) {
    case "status":
      return [mapClaudeStatusMessage(message, session)];
    case "files_persisted":
      return [mapClaudeFilesPersistedMessage(message, session)];
    case "task_started":
      return [mapClaudeTaskStartedMessage(message, session)];
    case "task_progress":
      return [mapClaudeTaskProgressMessage(message, session)];
    case "task_notification":
      return [mapClaudeTaskNotificationMessage(message, session)];
    default:
      return [];
  }
}

function mapClaudeStatusMessage(
  message: SDKStatusMessage,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "status",
    provider: "claude",
    session,
    status: message.status ?? "idle",
    detail: message.permissionMode,
    raw: message,
  };
}

function mapClaudeFilesPersistedMessage(
  message: SDKFilesPersistedEvent,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "file.changed",
    provider: "claude",
    session,
    changes: [
      ...message.files.map((file) => ({
        path: file.filename,
        changeType: "update" as const,
      })),
    ],
    outcome: message.failed.length > 0 ? "error" : "success",
    raw: message,
    extensions:
      message.failed.length > 0
        ? {
            failed: message.failed.map((file) => ({
              path: file.filename,
              error: file.error,
            })),
          }
        : undefined,
  };
}

function mapClaudeTaskStartedMessage(
  message: SDKTaskStartedMessage,
  session: SessionReference | null,
): AgentEvent {
  const toolCallId = message.tool_use_id ?? message.task_id;

  return {
    type: "tool.started",
    provider: "claude",
    session,
    toolCallId,
    toolName: message.task_type ?? "task",
    kind: "custom",
    input: {
      description: message.description,
      prompt: message.prompt,
    },
    raw: message,
    extensions: {
      taskId: message.task_id,
    },
  };
}

function mapClaudeTaskProgressMessage(
  message: SDKTaskProgressMessage,
  session: SessionReference | null,
): AgentEvent {
  const toolCallId = message.tool_use_id ?? message.task_id;

  return {
    type: "tool.updated",
    provider: "claude",
    session,
    toolCallId,
    statusText: message.description,
    output: {
      usage: message.usage,
      lastToolName: message.last_tool_name,
    },
    raw: message,
    extensions: {
      taskId: message.task_id,
    },
  };
}

function mapClaudeTaskNotificationMessage(
  message: SDKTaskNotificationMessage,
  session: SessionReference | null,
): AgentEvent {
  const toolCallId = message.tool_use_id ?? message.task_id;

  return {
    type: "tool.completed",
    provider: "claude",
    session,
    toolCallId,
    toolName: "task",
    kind: "custom",
    outcome:
      message.status === "completed"
        ? "success"
        : message.status === "stopped"
          ? "cancelled"
          : "error",
    output: {
      summary: message.summary,
      outputFile: message.output_file,
      usage: message.usage,
    },
    raw: message,
    extensions: {
      taskId: message.task_id,
    },
  };
}
