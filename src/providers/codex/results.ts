import type { Usage } from "@openai/codex-sdk";

import { AgentError } from "../../core/errors";
import type { AgentUsage, TurnResult } from "../../core/results";
import type { SessionReference } from "../../core/session";
import type { CodexTurnState } from "./state";

export function mapCodexUsage(usage: Usage | null): AgentUsage | null {
  if (!usage) {
    return null;
  }

  return {
    tokens: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cachedInput: usage.cached_input_tokens,
    },
  };
}

export function captureStructuredOutput(
  state: CodexTurnState,
  text: string,
): void {
  state.latestMessageText = text;

  if (!state.expectsStructuredOutput) {
    return;
  }

  try {
    state.latestStructuredOutput = JSON.parse(text);
    state.structuredOutputError = undefined;
  } catch (error) {
    state.latestStructuredOutput = undefined;
    state.structuredOutputError = new AgentError({
      code: "structured_output_invalid",
      provider: "codex",
      message: "Codex returned a non-JSON final response for a structured-output turn.",
      cause: error,
      raw: text,
    });
  }
}

export function buildCodexTurnResult(params: {
  session: SessionReference | null;
  usage: Usage | null;
  state: CodexTurnState;
}): TurnResult {
  return {
    provider: "codex",
    session: params.session,
    text: params.state.latestMessageText,
    structuredOutput: params.state.latestStructuredOutput,
    usage: mapCodexUsage(params.usage),
    stopReason: "completed",
    raw: {
      usage: params.usage,
      items: params.state.completedItems,
    },
  };
}
