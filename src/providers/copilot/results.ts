import type { AgentError } from "../../core/errors.js";
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
  structuredOutputError?: AgentError;
  latestUsage?: CopilotAssistantUsageEvent["data"];
  sawAssistantMessage: boolean;
  sawTurnStarted: boolean;
};

export function createCopilotTurnState(
  input: TurnInput,
  outputSchema?: JsonSchema,
): CopilotTurnState {
  return {
    input,
    outputSchema,
    latestMessageText: "",
    sawAssistantMessage: false,
    sawTurnStarted: false,
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
  };
}
