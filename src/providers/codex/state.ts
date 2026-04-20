import type { ThreadItem } from "@openai/codex-sdk";

import type { AgentError } from "../../core/errors.js";
import type { JsonSchema, TurnInput } from "../../core/input.js";

export type CodexTurnState = {
  input: TurnInput;
  outputSchema?: JsonSchema;
  latestMessageText: string;
  latestStructuredOutput?: unknown;
  structuredOutputError?: AgentError;
  completedItems: ThreadItem[];
};

export function createCodexTurnState(
  input: TurnInput,
  outputSchema?: JsonSchema,
): CodexTurnState {
  return {
    input,
    outputSchema,
    latestMessageText: "",
    completedItems: [],
  };
}
