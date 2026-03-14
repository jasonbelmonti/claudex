import { createCodexSessionReference } from "../../providers/codex/references";
import {
  createCodexTranscriptNormalizationContext,
  createCodexTranscriptNormalizationMetadata,
  ensureActiveTurn,
} from "./normalize-context";
import { normalizeEventMessageRecord } from "./normalize-event-msg";
import { emptyResult, unsupportedRecord } from "./normalize-helpers";
import { normalizeResponseItemRecord } from "./normalize-response-item";
import type {
  CodexTranscriptNormalizationContext,
  ParsedArtifact,
} from "./normalize-types";
import { asRecord, getString, isRecord, isString } from "./normalize-values";

export type { CodexTranscriptNormalizationContext } from "./normalize-types";
export {
  createCodexTranscriptNormalizationContext,
  createCodexTranscriptNormalizationMetadata,
};

export function normalizeCodexTranscriptRecord(
  record: unknown,
  context: CodexTranscriptNormalizationContext,
): ParsedArtifact {
  if (!isRecord(record) || !isString(record.type)) {
    return unsupportedRecord("Skipped malformed Codex transcript record.", record, context);
  }

  const timestamp = getString(record.timestamp) ?? undefined;
  const payload = asRecord(record.payload);

  switch (record.type) {
    case "session_meta":
      return normalizeSessionMetaRecord(payload, record, context, timestamp);
    case "event_msg":
      if (!payload) {
        return unsupportedRecord(
          "Codex event_msg record is missing payload.type.",
          record,
          context,
        );
      }

      return normalizeEventMessageRecord(payload, record, context, timestamp);
    case "response_item":
      if (!payload) {
        return unsupportedRecord(
          "Codex response_item record is missing payload.type.",
          record,
          context,
        );
      }

      return normalizeResponseItemRecord(payload, record, context, timestamp);
    case "turn_context":
      return normalizeTurnContextRecord(payload, context);
    default:
      return unsupportedRecord(
        `Unsupported Codex transcript record type: ${record.type}.`,
        record,
        context,
      );
  }
}

function normalizeSessionMetaRecord(
  payload: Record<string, unknown> | null,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const sessionId = getString(payload?.id);

  if (!sessionId) {
    return unsupportedRecord(
      "Codex session_meta record is missing payload.id.",
      record,
      context,
    );
  }

  context.sessionId = sessionId;

  return {
    sessionId,
    events: [
      {
        type: "session.started",
        provider: "codex",
        session: createCodexSessionReference(sessionId),
        reference: {
          provider: "codex",
          sessionId,
        },
        timestamp,
        raw: record,
      },
    ],
    warnings: [],
  };
}

function normalizeTurnContextRecord(
  payload: Record<string, unknown> | null,
  context: CodexTranscriptNormalizationContext,
): ParsedArtifact {
  const turnId = getString(payload?.turn_id);

  if (turnId) {
    ensureActiveTurn(context).turnId = turnId;
  }

  return emptyResult(context);
}
