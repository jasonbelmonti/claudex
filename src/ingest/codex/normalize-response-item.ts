import { unsupportedRecord } from "./normalize-helpers";
import {
  normalizeResponseMessageRecord,
  normalizeResponseReasoningRecord,
} from "./normalize-response-item-message";
import {
  normalizeCustomToolCallOutputRecord,
  normalizeCustomToolCallRecord,
  normalizeFunctionCallOutputRecord,
  normalizeFunctionCallRecord,
  normalizeWebSearchRecord,
} from "./normalize-response-item-tool";
import type {
  CodexTranscriptNormalizationContext,
  ParsedArtifact,
} from "./normalize-types";
import { getString } from "./normalize-values";

export function normalizeResponseItemRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const payloadType = getString(payload.type);

  if (!payloadType) {
    return unsupportedRecord(
      "Codex response_item record is missing payload.type.",
      record,
      context,
    );
  }

  switch (payloadType) {
    case "message":
      return normalizeResponseMessageRecord(payload, record, context, timestamp);
    case "reasoning":
      return normalizeResponseReasoningRecord(payload, record, context, timestamp);
    case "function_call":
      return normalizeFunctionCallRecord(payload, record, context, timestamp);
    case "function_call_output":
      return normalizeFunctionCallOutputRecord(payload, record, context, timestamp);
    case "custom_tool_call":
      return normalizeCustomToolCallRecord(payload, record, context, timestamp);
    case "custom_tool_call_output":
      return normalizeCustomToolCallOutputRecord(payload, record, context, timestamp);
    case "web_search_call":
      return normalizeWebSearchRecord(payload, record, context, timestamp);
    default:
      return unsupportedRecord(
        `Unsupported Codex response_item payload type: ${payloadType}.`,
        record,
        context,
      );
  }
}
