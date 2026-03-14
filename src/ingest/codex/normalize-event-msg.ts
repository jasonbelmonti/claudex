import { AgentError } from "../../core/errors";
import { createCodexSessionReference } from "../../providers/codex/references";
import {
  emitTurnStarted,
  ensureActiveTurn,
} from "./normalize-context";
import {
  emptyResult,
  extractUsageSnapshot,
  mapUsageSnapshot,
  unsupportedRecord,
} from "./normalize-helpers";
import type {
  CodexTranscriptNormalizationContext,
  ParsedArtifact,
} from "./normalize-types";
import { getString } from "./normalize-values";

export function normalizeEventMessageRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const payloadType = getString(payload.type);

  if (!payloadType) {
    return unsupportedRecord(
      "Codex event_msg record is missing payload.type.",
      record,
      context,
    );
  }

  switch (payloadType) {
    case "task_started":
      context.activeTurn = {
        turnId: getString(payload.turn_id) ?? context.activeTurn?.turnId,
        startedEmitted: false,
        latestAssistantText: "",
        usage: null,
      };
      context.pendingToolCalls.clear();
      return emptyResult(context);
    case "user_message":
      return normalizeUserPromptEvent(payload, record, context, timestamp);
    case "agent_message":
      return normalizeAssistantMessageEvent(payload, record, context, timestamp);
    case "agent_reasoning":
      return normalizeReasoningEvent(payload, record, context, timestamp);
    case "token_count":
      return normalizeTokenCountEvent(payload, context);
    case "task_complete":
      return normalizeTaskCompleteEvent(payload, record, context, timestamp);
    case "turn_aborted":
      return normalizeTurnAbortedEvent(payload, record, context, timestamp);
    case "context_compacted":
    case "item_completed":
      return emptyResult(context);
    default:
      return unsupportedRecord(
        `Unsupported Codex event_msg payload type: ${payloadType}.`,
        record,
        context,
      );
  }
}

function normalizeUserPromptEvent(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const message = getString(payload.message);

  if (!message) {
    return unsupportedRecord(
      "Codex user_message payload is missing message text.",
      record,
      context,
    );
  }

  return emitTurnStarted(message, record, context, timestamp);
}

function normalizeAssistantMessageEvent(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const message = getString(payload.message);

  if (!message) {
    return unsupportedRecord(
      "Codex agent_message payload is missing message text.",
      record,
      context,
    );
  }

  const turn = ensureActiveTurn(context);
  if (turn.lastAssistantMessageText === message) {
    return emptyResult(context);
  }

  turn.latestAssistantText = message;
  turn.lastAssistantMessageText = message;

  const phase = getString(payload.phase);

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "message.completed",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: turn.turnId,
        role: "assistant",
        text: message,
        timestamp,
        raw: record,
        extensions: phase
          ? {
              phase,
            }
          : undefined,
      },
    ],
    warnings: [],
  };
}

function normalizeReasoningEvent(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const text = getString(payload.text);

  if (!text) {
    return unsupportedRecord(
      "Codex agent_reasoning payload is missing text.",
      record,
      context,
    );
  }

  const turn = ensureActiveTurn(context);
  if (turn.lastReasoningText === text) {
    return emptyResult(context);
  }

  turn.lastReasoningText = text;

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "reasoning.summary",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: turn.turnId,
        summary: text,
        timestamp,
        raw: record,
      },
    ],
    warnings: [],
  };
}

function normalizeTokenCountEvent(
  payload: Record<string, unknown>,
  context: CodexTranscriptNormalizationContext,
): ParsedArtifact {
  const usage = extractUsageSnapshot(payload.info);

  if (!usage) {
    return emptyResult(context);
  }

  ensureActiveTurn(context).usage = usage;
  return emptyResult(context);
}

function normalizeTaskCompleteEvent(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const turn = context.activeTurn;
  const turnId = getString(payload.turn_id) ?? turn?.turnId;
  const text = turn?.latestAssistantText
    || getString(payload.last_agent_message)
    || "";
  const session = createCodexSessionReference(context.sessionId);
  const usage = mapUsageSnapshot(turn?.usage ?? null);

  context.activeTurn = null;
  context.pendingToolCalls.clear();

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "turn.completed",
        provider: "codex",
        session,
        turnId,
        timestamp,
        result: {
          provider: "codex",
          session,
          turnId,
          text,
          usage,
          stopReason: "completed",
          raw: {
            usage: turn?.usage ?? null,
          },
        },
        raw: record,
      },
    ],
    warnings: [],
  };
}

function normalizeTurnAbortedEvent(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const turnId = getString(payload.turn_id) ?? context.activeTurn?.turnId;
  const reason = getString(payload.reason);
  const session = createCodexSessionReference(context.sessionId);

  context.activeTurn = null;
  context.pendingToolCalls.clear();

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "turn.failed",
        provider: "codex",
        session,
        turnId,
        timestamp,
        error: new AgentError({
          code: "aborted",
          provider: "codex",
          message: reason
            ? `Codex turn aborted: ${reason}.`
            : "Codex turn aborted.",
          raw: record,
        }),
        raw: record,
      },
    ],
    warnings: [],
  };
}
