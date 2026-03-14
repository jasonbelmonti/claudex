import { createCodexSessionReference } from "../../providers/codex/references";
import {
  createToolDescriptor,
  inferToolOutcome,
} from "./normalize-tool-helpers";
import { unsupportedRecord } from "./normalize-result";
import type {
  CodexTranscriptNormalizationContext,
  ParsedArtifact,
} from "./normalize-types";
import { getString, parseMaybeJson } from "./normalize-values";

export function normalizeFunctionCallRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const callId = getString(payload.call_id);
  const name = getString(payload.name);

  if (!callId || !name) {
    return unsupportedRecord(
      "Codex function_call payload is missing call_id or name.",
      record,
      context,
    );
  }

  const descriptor = createToolDescriptor({
    name,
    input: parseMaybeJson(payload.arguments),
  });

  context.pendingToolCalls.set(callId, descriptor);

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "tool.started",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: context.activeTurn?.turnId,
        toolCallId: callId,
        toolName: descriptor.toolName,
        kind: descriptor.kind,
        input: descriptor.input,
        timestamp,
        raw: record,
        extensions: descriptor.extensions,
      },
    ],
    warnings: [],
  };
}

export function normalizeFunctionCallOutputRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const callId = getString(payload.call_id);

  if (!callId) {
    return unsupportedRecord(
      "Codex function_call_output payload is missing call_id.",
      record,
      context,
    );
  }

  const pendingTool = context.pendingToolCalls.get(callId);
  const output = parseMaybeJson(payload.output);
  const outcome = inferToolOutcome(output);

  context.pendingToolCalls.delete(callId);

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "tool.completed",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: context.activeTurn?.turnId,
        toolCallId: callId,
        toolName: pendingTool?.toolName ?? "unknown",
        kind: pendingTool?.kind ?? "unknown",
        outcome: outcome.outcome,
        output,
        errorMessage: outcome.errorMessage,
        timestamp,
        raw: record,
        extensions: pendingTool?.extensions,
      },
    ],
    warnings: [],
  };
}
