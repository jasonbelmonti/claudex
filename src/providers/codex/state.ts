import type { ThreadItem } from "@openai/codex-sdk";

import type { AgentError } from "../../core/errors";
import type { TurnInput } from "../../core/input";

export type CodexTurnState = {
  input: TurnInput;
  expectsStructuredOutput: boolean;
  latestMessageText: string;
  latestStructuredOutput?: unknown;
  structuredOutputError?: AgentError;
  completedItems: ThreadItem[];
};

export function createCodexTurnState(
  input: TurnInput,
  expectsStructuredOutput: boolean,
): CodexTurnState {
  return {
    input,
    expectsStructuredOutput,
    latestMessageText: "",
    completedItems: [],
  };
}
