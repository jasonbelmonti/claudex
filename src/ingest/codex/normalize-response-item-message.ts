import { createCodexSessionReference } from "../../providers/codex/references";
import {
  emitTurnStarted,
  ensureActiveTurn,
} from "./normalize-context";
import {
  emptyResult,
  extractReasoningSummary,
  extractResponseMessageText,
  unsupportedRecord,
} from "./normalize-helpers";
import type {
  CodexTranscriptNormalizationContext,
  ParsedArtifact,
} from "./normalize-types";
import { getString, isString } from "./normalize-values";

export function normalizeResponseMessageRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const role = getString(payload.role);
  const text = extractResponseMessageText(payload.content);

  switch (role) {
    case "user":
      if (!context.activeTurn) {
        return emptyResult(context);
      }

      if (!text) {
        return unsupportedRecord(
          "Codex response_item.message user payload is missing renderable text.",
          record,
          context,
        );
      }

      return emitTurnStarted(text, record, context, timestamp);
    case "assistant": {
      if (!text) {
        return unsupportedRecord(
          "Codex response_item.message assistant payload is missing renderable text.",
          record,
          context,
        );
      }

      const turn = ensureActiveTurn(context);
      if (turn.lastAssistantMessageText === text) {
        return emptyResult(context);
      }

      turn.latestAssistantText = text;
      turn.lastAssistantMessageText = text;

      return {
        sessionId: context.sessionId ?? undefined,
        events: [
          {
            type: "message.completed",
            provider: "codex",
            session: createCodexSessionReference(context.sessionId),
            turnId: turn.turnId,
            role: "assistant",
            text,
            timestamp,
            raw: record,
          },
        ],
        warnings: [],
      };
    }
    case "developer":
      return emptyResult(context);
    default:
      return emptyResult(context);
  }
}

export function normalizeResponseReasoningRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const summary = extractReasoningSummary(payload.summary);

  if (!summary) {
    return isString(payload.encrypted_content)
      ? emptyResult(context)
      : unsupportedRecord(
          "Codex reasoning payload is missing summary text.",
          record,
          context,
        );
  }

  const turn = ensureActiveTurn(context);
  if (turn.lastReasoningText === summary) {
    return emptyResult(context);
  }

  turn.lastReasoningText = summary;

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "reasoning.summary",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: turn.turnId,
        summary,
        timestamp,
        raw: record,
      },
    ],
    warnings: [],
  };
}
