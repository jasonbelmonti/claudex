import type {
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type { AgentEvent } from "../../core/events";
import type { SessionReference } from "../../core/session";
import {
  mapClaudeAuthStatusEvent,
  mapClaudeSystemMessageEvents,
  mapClaudeToolProgressEvent,
} from "./lifecycle-events";
import {
  mapClaudeAssistantMessageEvent,
  mapClaudePartialMessageEvent,
  mapClaudeResultMessageEvent,
} from "./message-events";
import type { ClaudeTurnState } from "./state";

export function mapClaudeMessageEvent(params: {
  message: SDKMessage;
  session: SessionReference | null;
  state: ClaudeTurnState;
}): AgentEvent[] {
  const { message, session, state } = params;

  switch (message.type) {
    case "stream_event":
      return mapClaudePartialMessageEvent(message, session);
    case "assistant":
      return mapClaudeAssistantMessageEvent({
        message,
        session,
        state,
      });
    case "result":
      return mapClaudeResultMessageEvent({
        message,
        session,
        state,
      });
    case "auth_status":
      return [mapClaudeAuthStatusEvent(message, session)];
    case "tool_progress":
      return [mapClaudeToolProgressEvent(message, session)];
    case "system":
      return mapClaudeSystemMessageEvents(message, session);
    default:
      return [];
  }
}
