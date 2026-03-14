import { createCodexSessionReference } from "../../providers/codex/references";
import {
  createSyntheticToolCallId,
  createToolDescriptor,
  inferToolOutcome,
  unsupportedRecord,
} from "./normalize-helpers";
import type {
  CodexTranscriptNormalizationContext,
  ParsedArtifact,
  PendingToolCall,
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

export function normalizeCustomToolCallRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const callId = getString(payload.call_id);
  const name = getString(payload.name);

  if (!callId || !name) {
    return unsupportedRecord(
      "Codex custom_tool_call payload is missing call_id or name.",
      record,
      context,
    );
  }

  const descriptor: PendingToolCall = {
    toolName: name,
    kind: "custom",
    input: parseMaybeJson(payload.input),
  };

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
      },
    ],
    warnings: [],
  };
}

export function normalizeCustomToolCallOutputRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const callId = getString(payload.call_id);

  if (!callId) {
    return unsupportedRecord(
      "Codex custom_tool_call_output payload is missing call_id.",
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
        kind: pendingTool?.kind ?? "custom",
        outcome: outcome.outcome,
        output,
        errorMessage: outcome.errorMessage,
        timestamp,
        raw: record,
      },
    ],
    warnings: [],
  };
}

export function normalizeWebSearchRecord(
  payload: Record<string, unknown>,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const status = getString(payload.status);
  const query = getString(payload.query);
  const toolCallId = getString(payload.call_id)
    ?? createSyntheticToolCallId(context, "web_search");

  if (status === "completed") {
    context.pendingToolCalls.delete(toolCallId);

    return {
      sessionId: context.sessionId ?? undefined,
      events: [
        {
          type: "tool.completed",
          provider: "codex",
          session: createCodexSessionReference(context.sessionId),
          turnId: context.activeTurn?.turnId,
          toolCallId,
          toolName: "web_search",
          kind: "custom",
          outcome: "success",
          output: query
            ? {
                query,
              }
            : undefined,
          timestamp,
          raw: record,
        },
      ],
      warnings: [],
    };
  }

  context.pendingToolCalls.set(toolCallId, {
    toolName: "web_search",
    kind: "custom",
    input: query
      ? {
          query,
        }
      : undefined,
  });

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "tool.started",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: context.activeTurn?.turnId,
        toolCallId,
        toolName: "web_search",
        kind: "custom",
        input: query
          ? {
              query,
            }
          : undefined,
        timestamp,
        raw: record,
      },
    ],
    warnings: [],
  };
}
