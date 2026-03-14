import type {
  CodexTranscriptNormalizationContext,
  PendingToolCall,
} from "./normalize-types";
import {
  asRecord,
  getNumber,
  getString,
  isRecord,
  isString,
} from "./normalize-values";

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
