import type { ToolKind } from "../../core/events";
import type { TurnInput } from "../../core/input";
import { createCodexSessionReference } from "../../providers/codex/references";
import type {
  CodexTranscriptNormalizationContext,
  CodexTranscriptTurnState,
  CodexUsageSnapshot,
  ParsedArtifact,
} from "./normalize-types";
import {
  asRecordOfRecords,
  getNumber,
  getString,
  isRecord,
} from "./normalize-values";

const CODEX_TRANSCRIPT_METADATA_KEY = "codexTranscriptNormalizationState";

export function createCodexTranscriptNormalizationContext(
  metadata?: Record<string, unknown>,
): CodexTranscriptNormalizationContext {
  const persistedState = metadata?.[CODEX_TRANSCRIPT_METADATA_KEY];

  if (!isRecord(persistedState)) {
    return {
      sessionId: null,
      activeTurn: null,
      pendingToolCalls: new Map(),
      syntheticToolCallCounter: 0,
    };
  }

  return {
    sessionId: getString(persistedState.sessionId) ?? null,
    activeTurn: parsePersistedTurnState(persistedState.activeTurn),
    pendingToolCalls: new Map(
      Object.entries(asRecordOfRecords(persistedState.pendingToolCalls)).map(
        ([callId, pendingCall]) => [
          callId,
          {
            toolName: getString(pendingCall.toolName) ?? "unknown",
            kind: normalizeToolKind(pendingCall.kind),
            input: pendingCall.input,
            extensions: isRecord(pendingCall.extensions)
              ? pendingCall.extensions
              : undefined,
          },
        ],
      ),
    ),
    syntheticToolCallCounter: getNumber(persistedState.syntheticToolCallCounter) ?? 0,
  };
}

export function createCodexTranscriptNormalizationMetadata(
  context: CodexTranscriptNormalizationContext,
): Record<string, unknown> | undefined {
  if (
    context.sessionId === null
    && context.activeTurn === null
    && context.pendingToolCalls.size === 0
    && context.syntheticToolCallCounter === 0
  ) {
    return;
  }

  return {
    [CODEX_TRANSCRIPT_METADATA_KEY]: {
      sessionId: context.sessionId ?? undefined,
      activeTurn: context.activeTurn
        ? {
            turnId: context.activeTurn.turnId,
            startedEmitted: context.activeTurn.startedEmitted,
            inputPrompt: context.activeTurn.inputPrompt,
            latestAssistantText: context.activeTurn.latestAssistantText,
            lastAssistantMessageText: context.activeTurn.lastAssistantMessageText,
            lastReasoningText: context.activeTurn.lastReasoningText,
            usage: context.activeTurn.usage ?? undefined,
          }
        : undefined,
      pendingToolCalls: Object.fromEntries(context.pendingToolCalls.entries()),
      syntheticToolCallCounter: context.syntheticToolCallCounter || undefined,
    },
  };
}

export function emitTurnStarted(
  prompt: string,
  record: unknown,
  context: CodexTranscriptNormalizationContext,
  timestamp?: string,
): ParsedArtifact {
  const turn = ensureActiveTurn(context);

  if (turn.startedEmitted) {
    return {
      sessionId: context.sessionId ?? undefined,
      events: [],
      warnings: [],
    };
  }

  turn.startedEmitted = true;
  turn.inputPrompt = prompt;

  const input: TurnInput = {
    prompt,
  };

  return {
    sessionId: context.sessionId ?? undefined,
    events: [
      {
        type: "turn.started",
        provider: "codex",
        session: createCodexSessionReference(context.sessionId),
        turnId: turn.turnId,
        input,
        timestamp,
        raw: record,
      },
    ],
    warnings: [],
  };
}

export function ensureActiveTurn(
  context: CodexTranscriptNormalizationContext,
): CodexTranscriptTurnState {
  if (context.activeTurn) {
    return context.activeTurn;
  }

  const turn: CodexTranscriptTurnState = {
    startedEmitted: false,
    latestAssistantText: "",
    usage: null,
  };
  context.activeTurn = turn;
  return turn;
}

function parsePersistedTurnState(value: unknown): CodexTranscriptTurnState | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    turnId: getString(value.turnId) ?? undefined,
    startedEmitted: value.startedEmitted === true,
    inputPrompt: getString(value.inputPrompt) ?? undefined,
    latestAssistantText: getString(value.latestAssistantText) ?? "",
    lastAssistantMessageText: getString(value.lastAssistantMessageText) ?? undefined,
    lastReasoningText: getString(value.lastReasoningText) ?? undefined,
    usage: parsePersistedUsage(value.usage),
  };
}

function parsePersistedUsage(value: unknown): CodexUsageSnapshot | null {
  if (!isRecord(value)) {
    return null;
  }

  const inputTokens = getNumber(value.input_tokens);
  const outputTokens = getNumber(value.output_tokens);

  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens: getNumber(value.cached_input_tokens) ?? undefined,
    reasoning_output_tokens: getNumber(value.reasoning_output_tokens) ?? undefined,
    total_tokens: getNumber(value.total_tokens) ?? undefined,
    model_context_window: getNumber(value.model_context_window) ?? undefined,
  };
}

function normalizeToolKind(value: unknown): ToolKind {
  switch (value) {
    case "command":
    case "mcp":
    case "custom":
    case "unknown":
      return value;
    default:
      return "unknown";
  }
}
