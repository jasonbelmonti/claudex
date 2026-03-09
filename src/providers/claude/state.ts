import type {
  SDKAssistantMessage,
  SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";

import type { AgentError } from "../../core/errors";
import type { JsonSchema, TurnInput } from "../../core/input";

export type ClaudeTurnState = {
  input: TurnInput;
  outputSchema?: JsonSchema;
  latestAssistantText: string;
  latestStructuredOutput?: unknown;
  structuredOutputError?: AgentError;
  latestAssistantMessage?: SDKAssistantMessage;
  latestResult?: SDKResultSuccess;
  sawTurnStarted: boolean;
};

export function createClaudeTurnState(
  input: TurnInput,
  outputSchema?: JsonSchema,
): ClaudeTurnState {
  return {
    input,
    outputSchema,
    latestAssistantText: "",
    sawTurnStarted: false,
  };
}
