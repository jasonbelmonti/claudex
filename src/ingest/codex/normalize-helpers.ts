import type { AgentUsage } from "../../core/results";
import type {
  CodexTranscriptNormalizationContext,
  CodexUsageSnapshot,
  ParsedArtifact,
  PendingToolCall,
} from "./normalize-types";
import {
  asRecord,
  getNumber,
  getString,
  isRecord,
  isString,
} from "./normalize-values";

export function emptyResult(
  context: CodexTranscriptNormalizationContext,
): ParsedArtifact {
  return {
    sessionId: context.sessionId ?? undefined,
    events: [],
    warnings: [],
  };
}

export function unsupportedRecord(
  message: string,
  raw: unknown,
  context: CodexTranscriptNormalizationContext,
): ParsedArtifact {
  return {
    sessionId: context.sessionId ?? undefined,
    events: [],
    warnings: [
      {
        code: "unsupported-record",
        message,
        raw,
      },
    ],
  };
}

export function extractResponseMessageText(content: unknown): string | null {
  if (!Array.isArray(content)) {
    return null;
  }

  const texts = content.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }

    const text = getString(part.text);
    return text ? [text] : [];
  });

  return texts.length > 0 ? texts.join("\n\n") : null;
}

export function extractReasoningSummary(summary: unknown): string | null {
  if (!Array.isArray(summary)) {
    return null;
  }

  const texts = summary.flatMap((part) => {
    if (!isRecord(part)) {
      return [];
    }

    const text = getString(part.text);
    return text ? [text] : [];
  });

  return texts.length > 0 ? texts.join("\n\n") : null;
}

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

export function createToolDescriptor(params: {
  name: string;
  input?: unknown;
}): PendingToolCall {
  const mcpMatch = /^mcp__([^_]+)__(.+)$/.exec(params.name);

  if (mcpMatch?.[1] && mcpMatch[2]) {
    return {
      toolName: mcpMatch[2],
      kind: "mcp",
      input: params.input,
      extensions: {
        server: mcpMatch[1],
      },
    };
  }

  if (
    params.name === "exec_command"
    || params.name === "shell_command"
    || params.name === "write_stdin"
    || params.name === "shell"
  ) {
    return {
      toolName: "command_execution",
      kind: "command",
      input: params.input,
    };
  }

  return {
    toolName: params.name,
    kind: "custom",
    input: params.input,
  };
}

export function inferToolOutcome(output: unknown): {
  outcome: "success" | "error";
  errorMessage?: string;
} {
  if (isRecord(output)) {
    const metadata = asRecord(output.metadata);
    const exitCode = getNumber(metadata?.exit_code);

    if (exitCode !== null && exitCode !== 0) {
      return {
        outcome: "error",
        errorMessage: getString(output.output) ?? `Tool exited with code ${exitCode}.`,
      };
    }

    const error = asRecord(output.error);
    const errorMessage = getString(error?.message) ?? getString(output.error);
    if (errorMessage) {
      return {
        outcome: "error",
        errorMessage,
      };
    }

    return {
      outcome: "success",
    };
  }

  if (isString(output) && output.toLowerCase().includes("execution error")) {
    return {
      outcome: "error",
      errorMessage: output,
    };
  }

  return {
    outcome: "success",
  };
}

export function createSyntheticToolCallId(
  context: CodexTranscriptNormalizationContext,
  prefix: string,
): string {
  context.syntheticToolCallCounter += 1;
  return `${prefix}-${context.syntheticToolCallCounter}`;
}
