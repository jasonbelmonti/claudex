import type {
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { AgentEvent } from "../../core/events";
import type { SessionReference } from "../../core/session";
import {
  buildClaudeTurnResult,
  captureClaudeAssistantMessage,
  captureClaudeResultMessage,
  createClaudeResultError,
  createClaudeStructuredOutputError,
} from "./results";
import type { ClaudeTurnState } from "./state";

export function mapClaudePartialMessageEvent(
  message: SDKPartialAssistantMessage,
  session: SessionReference | null,
): AgentEvent[] {
  if (
    message.event.type !== "content_block_delta" ||
    message.event.delta.type !== "text_delta"
  ) {
    return [];
  }

  return [
    {
      type: "message.delta",
      provider: "claude",
      session,
      messageId: message.uuid,
      role: "assistant",
      delta: message.event.delta.text,
      raw: message,
    },
  ];
}

export function mapClaudeAssistantMessageEvent(params: {
  message: Extract<SDKMessage, { type: "assistant" }>;
  session: SessionReference | null;
  state: ClaudeTurnState;
}): AgentEvent[] {
  captureClaudeAssistantMessage(params.state, params.message);

  return [
    {
      type: "message.completed",
      provider: "claude",
      session: params.session,
      messageId: params.message.uuid,
      role: "assistant",
      text: params.state.latestAssistantText,
      raw: params.message,
    },
  ];
}

export function mapClaudeResultMessageEvent(params: {
  message: SDKResultMessage;
  session: SessionReference | null;
  state: ClaudeTurnState;
}): AgentEvent[] {
  captureClaudeResultMessage(params.state, params.message);

  if (params.message.subtype !== "success") {
    return [
      {
        type: "turn.failed",
        provider: "claude",
        session: params.session,
        error: createClaudeResultError(params.message),
        raw: params.message,
      },
    ];
  }

  const structuredOutputError = createClaudeStructuredOutputError(params.state);

  if (structuredOutputError) {
    return [
      {
        type: "turn.failed",
        provider: "claude",
        session: params.session,
        error: structuredOutputError,
        raw: params.message,
      },
    ];
  }

  return [
    {
      type: "turn.completed",
      provider: "claude",
      session: params.session,
      result: buildClaudeTurnResult({
        session: params.session,
        state: params.state,
        result: params.message,
      }),
      raw: params.message,
    },
  ];
}
