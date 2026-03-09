import type {
  NonNullableUsage,
  SDKAssistantMessage,
  SDKResultMessage,
  SDKResultSuccess,
} from "@anthropic-ai/claude-agent-sdk";

import {
  parseStructuredOutputText,
  validateStructuredOutputValue,
} from "../../core/schema-validation";
import { AgentError } from "../../core/errors";
import type { AgentUsage, TurnResult } from "../../core/results";
import type { SessionReference } from "../../core/session";
import type { ClaudeTurnState } from "./state";

export function captureClaudeAssistantMessage(
  state: ClaudeTurnState,
  message: SDKAssistantMessage,
): void {
  state.latestAssistantMessage = message;
  state.latestAssistantText = extractAssistantText(message);
}

export function captureClaudeResultMessage(
  state: ClaudeTurnState,
  result: SDKResultMessage,
): void {
  if (result.subtype !== "success") {
    return;
  }

  state.latestResult = result;

  if (!state.outputSchema) {
    return;
  }

  if (result.structured_output !== undefined) {
    const validation = validateStructuredOutputValue({
      provider: "claude",
      providerLabel: "Claude",
      schema: state.outputSchema,
      value: result.structured_output,
    });

    state.latestStructuredOutput = validation.value;
    state.structuredOutputError = validation.error;
    return;
  }

  const parsed = parseStructuredOutputText({
    provider: "claude",
    providerLabel: "Claude",
    schema: state.outputSchema,
    text: result.result,
  });

  state.latestStructuredOutput = parsed.value;
  state.structuredOutputError = parsed.error;
}

export function buildClaudeTurnResult(params: {
  session: SessionReference | null;
  state: ClaudeTurnState;
  result: SDKResultSuccess;
}): TurnResult {
  return {
    provider: "claude",
    session: params.session,
    text: resolveClaudeResultText(params),
    structuredOutput: params.state.latestStructuredOutput,
    usage: mapClaudeUsage(params.result.usage, params.result.total_cost_usd, params.result.modelUsage),
    stopReason: params.result.stop_reason,
    raw: {
      assistant: params.state.latestAssistantMessage,
      result: params.result,
    },
  };
}

export function createClaudeResultError(result: SDKResultMessage): AgentError {
  if (result.subtype === "success") {
    throw new Error("Expected an error result message.");
  }

  const message =
    result.errors.join("\n").trim() ||
    "Claude returned an error result for the current turn.";

  return new AgentError({
    code: mapClaudeResultErrorCode(result),
    provider: "claude",
    message,
    details: {
      subtype: result.subtype,
      permissionDenials: result.permission_denials,
    },
    raw: result,
  });
}

function resolveClaudeResultText(params: {
  state: ClaudeTurnState;
  result: SDKResultSuccess;
}): string {
  const resultText = params.result.result.trim();

  if (resultText.length > 0) {
    return params.result.result;
  }

  if (params.state.latestAssistantText.length > 0) {
    return params.state.latestAssistantText;
  }

  if (params.state.latestStructuredOutput === undefined) {
    return "";
  }

  return stringifyStructuredOutput(params.state.latestStructuredOutput);
}

function stringifyStructuredOutput(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function createClaudeStructuredOutputError(
  state: ClaudeTurnState,
): AgentError | undefined {
  return state.structuredOutputError;
}

function mapClaudeResultErrorCode(result: Exclude<SDKResultMessage, SDKResultSuccess>): AgentError["code"] {
  if (result.subtype === "error_max_structured_output_retries") {
    return "structured_output_invalid";
  }

  if (result.permission_denials.length > 0) {
    return "permission_denied";
  }

  return "provider_failure";
}

function mapClaudeUsage(
  usage: NonNullableUsage,
  costUsd: number,
  modelUsage: Record<string, unknown>,
): AgentUsage {
  return {
    tokens: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cachedInput: usage.cache_read_input_tokens,
    },
    costUsd,
    providerUsage: {
      cacheCreationInputTokens: usage.cache_creation_input_tokens,
      serviceTier: usage.service_tier,
      modelUsage,
    },
  };
}

function extractAssistantText(message: SDKAssistantMessage): string {
  return message.message.content
    .flatMap((block: { type: string; text?: string }) =>
      block.type === "text" && block.text ? [block.text] : [],
    )
    .join("");
}
