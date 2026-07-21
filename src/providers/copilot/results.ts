import { AgentError } from "../../core/errors.js";
import type { ToolKind } from "../../core/events.js";
import type { JsonSchema, TurnInput } from "../../core/input.js";
import type { AgentUsage, TurnResult } from "../../core/results.js";
import { parseStructuredOutputText } from "../../core/schema-validation.js";
import type { SessionReference } from "../../core/session.js";
import type { CopilotSessionEvent } from "./types.js";

type CopilotAssistantUsageEvent = Extract<
  CopilotSessionEvent,
  { type: "assistant.usage" }
>;

export type CopilotTurnState = {
  input: TurnInput;
  outputSchema?: JsonSchema;
  latestMessageId?: string;
  latestMessageText: string;
  latestStructuredOutput?: unknown;
  latestModelCallFailure?: Extract<
    CopilotSessionEvent,
    { type: "model.call_failure" }
  >;
  structuredOutputError?: AgentError;
  latestUsage?: CopilotAssistantUsageEvent["data"];
  assistantMessageCount: number;
  eventSequence: string[];
  sawAssistantMessage: boolean;
  sawTurnStarted: boolean;
  toolMetadataByCallId: Map<string, { kind: ToolKind; toolName: string }>;
};

export function createCopilotTurnState(
  input: TurnInput,
  outputSchema?: JsonSchema,
): CopilotTurnState {
  return {
    input,
    outputSchema,
    latestMessageText: "",
    assistantMessageCount: 0,
    eventSequence: [],
    sawAssistantMessage: false,
    sawTurnStarted: false,
    toolMetadataByCallId: new Map(),
  };
}

export function captureCopilotAssistantMessage(
  state: CopilotTurnState,
  params: {
    messageId?: string;
    text: string;
  },
): void {
  state.latestMessageId = params.messageId;
  state.latestMessageText = params.text;
  state.assistantMessageCount += 1;
  state.sawAssistantMessage = true;

  if (!state.outputSchema) {
    return;
  }

  const result = parseStructuredOutputText({
    provider: "copilot",
    providerLabel: "Copilot",
    schema: state.outputSchema,
    text: params.text,
  });

  state.latestStructuredOutput = result.value;
  state.structuredOutputError = result.error;
}

export function captureCopilotEventType(
  state: CopilotTurnState,
  eventType: string,
): void {
  if (state.eventSequence.length < 100) {
    state.eventSequence.push(eventType);
  }
}

export function addCopilotSelectionDiagnostics(
  state: CopilotTurnState,
  error: AgentError,
): AgentError {
  const selection = {
    assistantMessageCount: state.assistantMessageCount,
    eventSequence: [...state.eventSequence],
    selectedMessageId: state.latestMessageId,
  };
  const diagnostics = isRecord(error.extensions?.diagnostics)
    ? error.extensions.diagnostics
    : {};

  return new AgentError({
    code: error.code,
    provider: error.provider,
    message: error.message,
    cause: error.cause,
    details: {
      ...error.details,
      ...selection,
    },
    raw: error.raw,
    extensions: {
      ...error.extensions,
      diagnostics: {
        ...diagnostics,
        ...selection,
      },
    },
  });
}

export function captureCopilotUsage(
  state: CopilotTurnState,
  usage: CopilotAssistantUsageEvent["data"],
): void {
  state.latestUsage = usage;
}

export function buildCopilotTurnResult(params: {
  session: SessionReference | null;
  state: CopilotTurnState;
}): TurnResult {
  return {
    provider: "copilot",
    session: params.session,
    text: params.state.latestMessageText,
    structuredOutput: params.state.latestStructuredOutput,
    usage: mapCopilotUsage(params.state.latestUsage),
    stopReason: "completed",
    raw: params.state.latestUsage
      ? {
          usage: params.state.latestUsage,
        }
      : undefined,
  };
}

function mapCopilotUsage(
  usage: CopilotAssistantUsageEvent["data"] | undefined,
): AgentUsage | null {
  if (!usage) {
    return null;
  }

  if (
    typeof usage.inputTokens !== "number" ||
    typeof usage.outputTokens !== "number"
  ) {
    return null;
  }

  return {
    tokens: {
      input: usage.inputTokens,
      output: usage.outputTokens,
      cachedInput: usage.cacheReadTokens,
    },
    providerUsage: {
      ...usage,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
