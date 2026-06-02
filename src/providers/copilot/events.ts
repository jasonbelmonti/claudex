import type { AgentEvent, ToolKind } from "../../core/events.js";
import type { SessionReference } from "../../core/session.js";
import { createCopilotAbortedError, createCopilotProviderError } from "./errors.js";
import {
  buildCopilotTurnResult,
  captureCopilotAssistantMessage,
  captureCopilotUsage,
  type CopilotTurnState,
} from "./results.js";
import type { CopilotSessionEvent } from "./types.js";

type CopilotSessionStartedEvent = Extract<
  CopilotSessionEvent,
  { type: "session.start" }
>;
type CopilotAssistantMessageEvent = Extract<
  CopilotSessionEvent,
  { type: "assistant.message" }
>;
type CopilotAssistantMessageDeltaEvent = Extract<
  CopilotSessionEvent,
  { type: "assistant.message_delta" }
>;
type CopilotSessionErrorEvent = Extract<
  CopilotSessionEvent,
  { type: "session.error" }
>;
type CopilotIdleEvent = Extract<CopilotSessionEvent, { type: "session.idle" }>;
type CopilotToolStartedEvent = Extract<
  CopilotSessionEvent,
  { type: "tool.execution_start" }
>;
type CopilotToolUpdatedEvent = Extract<
  CopilotSessionEvent,
  { type: "tool.execution_partial_result" | "tool.execution_progress" }
>;
type CopilotToolCompletedEvent = Extract<
  CopilotSessionEvent,
  { type: "tool.execution_complete" }
>;

export type CopilotTerminalEvent =
  | Extract<AgentEvent, { type: "turn.completed" }>
  | Extract<AgentEvent, { type: "turn.failed" }>;

export function mapCopilotSessionEvent(params: {
  event: CopilotSessionEvent;
  getSessionReference: () => SessionReference | null;
  state: CopilotTurnState;
}): AgentEvent[] {
  const { event, getSessionReference, state } = params;
  const session = getSessionReference();

  if (isSubAgentEvent(event)) {
    return [];
  }

  switch (event.type) {
    case "session.start":
      return [mapSessionStartedEvent(event)];
    case "assistant.message_delta":
      return [mapAssistantMessageDeltaEvent(event, session)];
    case "assistant.message":
      return [mapAssistantMessageEvent(event, session, state)];
    case "assistant.usage":
      captureCopilotUsage(state, event.data);
      return [];
    case "tool.execution_start":
      return [mapToolStartedEvent(event, session, state)];
    case "tool.execution_partial_result":
    case "tool.execution_progress":
      return [mapToolUpdatedEvent(event, session)];
    case "tool.execution_complete":
      return [mapToolCompletedEvent(event, session, state)];
    case "session.error":
      return [mapSessionErrorEvent(event, session)];
    case "model.call_failure":
      state.latestModelCallFailure = event;
      return [];
    case "session.idle":
      return [mapIdleEvent(event, session, state)];
    default:
      return [];
  }
}

function isSubAgentEvent(event: CopilotSessionEvent): boolean {
  return "agentId" in event && event.agentId !== undefined;
}

export function createCopilotTurnStartedEvent(params: {
  input: CopilotTurnState["input"];
  session: SessionReference | null;
}): AgentEvent {
  return {
    type: "turn.started",
    provider: "copilot",
    session: params.session,
    input: params.input,
  };
}

export function createCopilotTurnFailedEvent(params: {
  error: Extract<AgentEvent, { type: "turn.failed" }>["error"];
  session: SessionReference | null;
}): AgentEvent {
  return {
    type: "turn.failed",
    provider: "copilot",
    session: params.session,
    error: params.error,
    raw: params.error.raw,
  };
}

function mapSessionStartedEvent(
  event: CopilotSessionStartedEvent,
): AgentEvent {
  const reference = {
    provider: "copilot" as const,
    sessionId: event.data.sessionId,
  };

  return {
    type: "session.started",
    provider: "copilot",
    session: reference,
    reference,
    timestamp: event.timestamp,
  };
}

function mapAssistantMessageDeltaEvent(
  event: CopilotAssistantMessageDeltaEvent,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "message.delta",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    messageId: event.data.messageId,
    role: "assistant",
    delta: event.data.deltaContent,
  };
}

function mapAssistantMessageEvent(
  event: CopilotAssistantMessageEvent,
  session: SessionReference | null,
  state: CopilotTurnState,
): AgentEvent {
  captureCopilotAssistantMessage(state, {
    messageId: event.data.messageId,
    text: event.data.content,
  });

  return {
    type: "message.completed",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    messageId: event.data.messageId,
    role: "assistant",
    text: event.data.content,
    structuredOutput: state.latestStructuredOutput,
  };
}

function mapToolStartedEvent(
  event: CopilotToolStartedEvent,
  session: SessionReference | null,
  state: CopilotTurnState,
): AgentEvent {
  const metadata = {
    kind: classifyCopilotToolKind(event.data.toolName, event.data.mcpServerName),
    toolName: event.data.toolName,
  };
  state.toolMetadataByCallId.set(event.data.toolCallId, metadata);

  return {
    type: "tool.started",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    turnId: event.data.turnId,
    toolCallId: event.data.toolCallId,
    toolName: metadata.toolName,
    kind: metadata.kind,
    input: event.data.arguments,
    extensions: event.data.mcpServerName
      ? {
          server: event.data.mcpServerName,
          mcpToolName: event.data.mcpToolName,
        }
      : undefined,
  };
}

function mapToolUpdatedEvent(
  event: CopilotToolUpdatedEvent,
  session: SessionReference | null,
): AgentEvent {
  const data =
    event.type === "tool.execution_partial_result"
      ? {
          output: event.data.partialOutput,
        }
      : {
          statusText: event.data.progressMessage,
        };

  return {
    type: "tool.updated",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    toolCallId: event.data.toolCallId,
    ...data,
  };
}

function mapToolCompletedEvent(
  event: CopilotToolCompletedEvent,
  session: SessionReference | null,
  state: CopilotTurnState,
): AgentEvent {
  const metadata = state.toolMetadataByCallId.get(event.data.toolCallId);
  state.toolMetadataByCallId.delete(event.data.toolCallId);
  const toolName = metadata?.toolName ?? event.data.toolDescription?.name ?? "unknown";

  return {
    type: "tool.completed",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    turnId: event.data.turnId,
    toolCallId: event.data.toolCallId,
    toolName,
    kind: metadata?.kind ?? classifyCopilotToolKind(toolName),
    outcome: event.data.success ? "success" : "error",
    output: event.data.result?.content,
    errorMessage: event.data.error?.message,
  };
}

function mapSessionErrorEvent(
  event: CopilotSessionErrorEvent,
  session: SessionReference | null,
): AgentEvent {
  return createCopilotTurnFailedEvent({
    session,
    error: createCopilotProviderError({
      fallbackMessage: event.data.message,
      raw: event,
    }),
  });
}

function mapIdleEvent(
  event: CopilotIdleEvent,
  session: SessionReference | null,
  state: CopilotTurnState,
): CopilotTerminalEvent {
  if (event.data.aborted) {
    return createCopilotTurnFailedEvent({
      session,
      error: createCopilotAbortedError(event),
    }) as CopilotTerminalEvent;
  }

  if (state.structuredOutputError) {
    return createCopilotTurnFailedEvent({
      session,
      error: state.structuredOutputError,
    }) as CopilotTerminalEvent;
  }

  if (!state.sawAssistantMessage) {
    if (state.latestModelCallFailure) {
      return createCopilotTurnFailedEvent({
        session,
        error: createCopilotProviderError({
          fallbackMessage:
            state.latestModelCallFailure.data.errorMessage ??
            "Copilot model call failed.",
          raw: state.latestModelCallFailure,
        }),
      }) as CopilotTerminalEvent;
    }

    return createCopilotTurnFailedEvent({
      session,
      error: createCopilotProviderError({
        fallbackMessage:
          "Copilot stream ended without a completed assistant message.",
        raw: event,
      }),
    }) as CopilotTerminalEvent;
  }

  return {
    type: "turn.completed",
    provider: "copilot",
    session,
    timestamp: event.timestamp,
    result: buildCopilotTurnResult({
      session,
      state,
    }),
  };
}

function classifyCopilotToolKind(
  toolName: string,
  mcpServerName?: string,
): ToolKind {
  if (mcpServerName) {
    return "mcp";
  }

  if (toolName === "run_in_terminal" || toolName.includes("shell")) {
    return "command";
  }

  return "unknown";
}
