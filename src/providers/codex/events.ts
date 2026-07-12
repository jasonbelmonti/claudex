import type {
  TurnCompletedEvent as CodexTurnCompletedEvent,
  TurnFailedEvent as CodexTurnFailedEvent,
  ThreadErrorEvent,
  ThreadEvent,
} from "@openai/codex-sdk";

import { AgentError } from "../../core/errors.js";
import type { AgentEvent } from "../../core/events.js";
import type { SessionReference } from "../../core/session.js";
import { mapCodexItemEvent } from "./item-events.js";
import { buildCodexTurnResult } from "./results.js";
import type { CodexTurnState } from "./state.js";
import { createCodexTerminalFailure } from "./terminal-failures.js";

type GetSessionReference = () => SessionReference | null;

export function mapCodexThreadEvent(params: {
  event: ThreadEvent;
  state: CodexTurnState;
  getSessionReference: GetSessionReference;
  knownSessionReference: SessionReference | null;
}): AgentEvent[] {
  const { event, state, getSessionReference, knownSessionReference } = params;
  const session = getSessionReference();

  switch (event.type) {
    case "thread.started":
      if (
        knownSessionReference?.provider === "codex" &&
        knownSessionReference.sessionId === event.thread_id
      ) {
        return [];
      }

      return [
        {
          type: "session.started",
          provider: "codex",
          session: {
            provider: "codex",
            sessionId: event.thread_id,
          },
          reference: {
            provider: "codex",
            sessionId: event.thread_id,
          },
          raw: event,
        },
      ];
    case "turn.started":
      return [
        {
          type: "turn.started",
          provider: "codex",
          session,
          input: state.input,
          raw: event,
        },
      ];
    case "item.started":
    case "item.updated":
    case "item.completed":
      return mapCodexItemEvent({
        event,
        session,
        state,
      });
    case "turn.completed":
      return mapCodexTurnCompletedEvent({
        event,
        session,
        state,
      });
    case "turn.failed":
      return [createTurnFailedEvent(event, session)];
    case "error":
      return [createThreadErrorEvent(event, session)];
  }
}

function mapCodexTurnCompletedEvent(params: {
  event: CodexTurnCompletedEvent;
  session: SessionReference | null;
  state: CodexTurnState;
}): AgentEvent[] {
  const { event, session, state } = params;

  if (!state.latestMessageText.trim()) {
    return [
      {
        type: "turn.failed",
        provider: "codex",
        session,
        error: createCodexTerminalFailure({
          failureKind: "completed_without_agent_message",
          session,
          raw: event,
        }),
        raw: event,
      },
    ];
  }

  if (state.structuredOutputError) {
    return [
      {
        type: "turn.failed",
        provider: "codex",
        session,
        error: state.structuredOutputError,
        raw: event,
      },
    ];
  }

  return [
    {
      type: "turn.completed",
      provider: "codex",
      session,
      result: buildCodexTurnResult({
        session,
        usage: event.usage,
        state,
      }),
      raw: event,
    },
  ];
}

function createTurnFailedEvent(
  event: CodexTurnFailedEvent,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "turn.failed",
    provider: "codex",
    session,
    error: new AgentError({
      code: "provider_failure",
      provider: "codex",
      message: event.error.message,
      raw: event,
    }),
    raw: event,
  };
}

function createThreadErrorEvent(
  event: ThreadErrorEvent,
  session: SessionReference | null,
): AgentEvent {
  return {
    type: "turn.failed",
    provider: "codex",
    session,
    error: new AgentError({
      code: "provider_failure",
      provider: "codex",
      message: event.message,
      raw: event,
    }),
    raw: event,
  };
}
