import type {
  AgentMessageItem,
  CommandExecutionItem,
  ItemCompletedEvent,
  ItemStartedEvent,
  ItemUpdatedEvent,
  McpToolCallItem,
  ThreadItem,
  WebSearchItem,
} from "@openai/codex-sdk";

import type { AgentEvent } from "../../core/events";
import type { SessionReference } from "../../core/session";
import { captureStructuredOutput } from "./results";
import type { CodexTurnState } from "./state";

type CodexItemEvent = ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent;

export function mapCodexItemEvent(params: {
  event: CodexItemEvent;
  session: SessionReference | null;
  turnId?: string;
  state: CodexTurnState;
}): AgentEvent[] {
  const { event, session, turnId, state } = params;
  const item = event.item;

  if (event.type === "item.completed") {
    state.completedItems.push(item);
  }

  switch (item.type) {
    case "agent_message":
      return mapAgentMessageItem(event, item, session, turnId, state);
    case "reasoning":
      return event.type === "item.completed"
        ? [
            {
              type: "reasoning.summary",
              provider: "codex",
              session,
              turnId,
              summary: item.text,
              raw: event,
            },
          ]
        : [];
    case "command_execution":
      return mapCommandItem(event, item, session, turnId);
    case "mcp_tool_call":
      return mapMcpItem(event, item, session, turnId);
    case "web_search":
      return mapWebSearchItem(event, item, session, turnId);
    case "file_change":
      return event.type === "item.completed"
        ? [
            {
              type: "file.changed",
              provider: "codex",
              session,
              turnId,
              changes: item.changes.map((change) => ({
                path: change.path,
                changeType: change.kind,
              })),
              outcome: item.status === "completed" ? "success" : "error",
              raw: event,
            },
          ]
        : [];
    case "todo_list":
      return [
        {
          type: "todo.updated",
          provider: "codex",
          session,
          turnId,
          items: item.items,
          raw: event,
        },
      ];
    case "error":
      return [
        {
          type: "status",
          provider: "codex",
          session,
          turnId,
          status: "error",
          detail: item.message,
          raw: event,
        },
      ];
    default:
      return [];
  }
}

function mapAgentMessageItem(
  event: CodexItemEvent,
  item: AgentMessageItem,
  session: SessionReference | null,
  turnId: string | undefined,
  state: CodexTurnState,
): AgentEvent[] {
  if (event.type !== "item.completed") {
    return [];
  }

  captureStructuredOutput(state, item.text);

  return [
    {
      type: "message.completed",
      provider: "codex",
      session,
      turnId,
      messageId: item.id,
      role: "assistant",
      text: item.text,
      structuredOutput: state.latestStructuredOutput,
      raw: event,
    },
  ];
}

function mapCommandItem(
  event: CodexItemEvent,
  item: CommandExecutionItem,
  session: SessionReference | null,
  turnId: string | undefined,
): AgentEvent[] {
  switch (event.type) {
    case "item.started":
      return [
        {
          type: "tool.started",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          toolName: "command_execution",
          kind: "command",
          input: {
            command: item.command,
          },
          raw: event,
        },
      ];
    case "item.updated":
      return [
        {
          type: "tool.updated",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          statusText: item.status,
          output: {
            aggregatedOutput: item.aggregated_output,
            exitCode: item.exit_code,
          },
          raw: event,
        },
      ];
    case "item.completed":
      return [
        {
          type: "tool.completed",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          toolName: "command_execution",
          kind: "command",
          outcome: item.status === "completed" ? "success" : "error",
          output: {
            command: item.command,
            aggregatedOutput: item.aggregated_output,
            exitCode: item.exit_code,
          },
          errorMessage:
            item.status === "failed"
              ? item.aggregated_output || "Command execution failed."
              : undefined,
          raw: event,
        },
      ];
  }
}

function mapMcpItem(
  event: CodexItemEvent,
  item: McpToolCallItem,
  session: SessionReference | null,
  turnId: string | undefined,
): AgentEvent[] {
  switch (event.type) {
    case "item.started":
      return [
        {
          type: "tool.started",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          toolName: item.tool,
          kind: "mcp",
          input: item.arguments,
          raw: event,
          extensions: {
            server: item.server,
          },
        },
      ];
    case "item.updated":
      return [
        {
          type: "tool.updated",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          statusText: item.status,
          output: item.result,
          raw: event,
          extensions: {
            server: item.server,
          },
        },
      ];
    case "item.completed":
      return [
        {
          type: "tool.completed",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          toolName: item.tool,
          kind: "mcp",
          outcome: item.status === "completed" ? "success" : "error",
          output: item.result,
          errorMessage: item.error?.message,
          raw: event,
          extensions: {
            server: item.server,
          },
        },
      ];
  }
}

function mapWebSearchItem(
  event: CodexItemEvent,
  item: WebSearchItem,
  session: SessionReference | null,
  turnId: string | undefined,
): AgentEvent[] {
  switch (event.type) {
    case "item.started":
      return [
        {
          type: "tool.started",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          toolName: "web_search",
          kind: "custom",
          input: {
            query: item.query,
          },
          raw: event,
        },
      ];
    case "item.updated":
      return [
        {
          type: "tool.updated",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          statusText: "in_progress",
          raw: event,
        },
      ];
    case "item.completed":
      return [
        {
          type: "tool.completed",
          provider: "codex",
          session,
          turnId,
          toolCallId: item.id,
          toolName: "web_search",
          kind: "custom",
          outcome: "success",
          output: {
            query: item.query,
          },
          raw: event,
        },
      ];
  }
}
