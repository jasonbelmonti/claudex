import type { AgentUsage } from "../../core/results";
import type { CodexUsageSnapshot } from "./normalize-types";
import {
  asRecord,
  getNumber,
  isRecord,
} from "./normalize-values";

export function extractUsageSnapshot(info: unknown): CodexUsageSnapshot | null {
  if (!isRecord(info)) {
    return null;
  }

  const totalUsage = asRecord(info.total_token_usage)
    ?? asRecord(info.last_token_usage);

  if (!totalUsage) {
    return null;
  }

  const inputTokens = getNumber(totalUsage.input_tokens);
  const outputTokens = getNumber(totalUsage.output_tokens);

  if (inputTokens === null || outputTokens === null) {
    return null;
  }

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens: getNumber(totalUsage.cached_input_tokens) ?? undefined,
    reasoning_output_tokens: getNumber(totalUsage.reasoning_output_tokens) ?? undefined,
    total_tokens: getNumber(totalUsage.total_tokens) ?? undefined,
    model_context_window: getNumber(info.model_context_window) ?? undefined,
  };
}

export function mapUsageSnapshot(usage: CodexUsageSnapshot | null): AgentUsage | null {
  if (!usage) {
    return null;
  }

  return {
    tokens: {
      input: usage.input_tokens,
      output: usage.output_tokens,
      cachedInput: usage.cached_input_tokens,
    },
    providerUsage: {
      reasoningOutputTokens: usage.reasoning_output_tokens,
      totalTokens: usage.total_tokens,
      modelContextWindow: usage.model_context_window,
    },
  };
}
