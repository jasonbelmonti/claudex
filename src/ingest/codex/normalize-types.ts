import type { ToolKind } from "../../core/events";
import type { IngestWarning } from "../warnings";

export type ParsedArtifact = {
  events: import("../../core/events").AgentEvent[];
  warnings: IngestWarning[];
  sessionId?: string;
};

export type PendingToolCall = {
  toolName: string;
  kind: ToolKind;
  input?: unknown;
  extensions?: Record<string, unknown>;
};

export type CodexUsageSnapshot = {
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens?: number;
  reasoning_output_tokens?: number;
  total_tokens?: number;
  model_context_window?: number;
};

export type CodexTranscriptTurnState = {
  turnId?: string;
  startedEmitted: boolean;
  inputPrompt?: string;
  latestAssistantText: string;
  lastAssistantMessageText?: string;
  lastReasoningText?: string;
  usage: CodexUsageSnapshot | null;
};

export type CodexTranscriptNormalizationContext = {
  sessionId: string | null;
  activeTurn: CodexTranscriptTurnState | null;
  pendingToolCalls: Map<string, PendingToolCall>;
  syntheticToolCallCounter: number;
};

export type CodexTranscriptRecord = {
  timestamp?: unknown;
  type?: unknown;
  payload?: unknown;
};
