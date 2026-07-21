import { AgentError } from "../../core/errors.js";
import type { JsonSchema, TurnInput } from "../../core/input.js";
import type { ExecutionMode } from "../../core/session.js";
import { canonicalizeJson } from "../../core/structured-output-diagnostics.js";
import { mapCopilotAgentMode } from "./plan-mode.js";
import type {
  CopilotMessageOptions,
  CopilotTurnProviderOptions,
} from "./types.js";

export const DEFAULT_COPILOT_TURN_TIMEOUT_MS = 60_000;

export function mapTurnInputToCopilotMessage(
  input: TurnInput,
  executionMode?: ExecutionMode,
  outputSchema?: JsonSchema,
): CopilotMessageOptions {
  if (input.attachments?.length) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "copilot",
      message:
        "Copilot image attachment normalization is deferred until image input is verified end-to-end.",
    });
  }

  const agentMode = mapCopilotAgentMode(executionMode);

  return {
    prompt: appendStructuredOutputContract(input.prompt, outputSchema),
    ...(agentMode ? { agentMode } : {}),
  };
}

function appendStructuredOutputContract(
  prompt: string,
  outputSchema?: JsonSchema,
): string {
  if (!outputSchema) {
    return prompt;
  }

  return [
    prompt,
    "<claudex_structured_output_contract>",
    "Return exactly one JSON value that validates against the JSON Schema below.",
    "Do not use Markdown fences, prose, comments, or multiple JSON values.",
    "Do not omit required fields. Claudex will reject malformed or schema-invalid output without repair or retry.",
    canonicalizeJson(outputSchema),
    "</claudex_structured_output_contract>",
  ].join("\n\n");
}

export function getCopilotTurnProviderOptions(
  providerOptions?: Record<string, unknown>,
): CopilotTurnProviderOptions {
  const copilotOptions = providerOptions?.copilot;

  if (copilotOptions === undefined) {
    return {};
  }

  if (!isRecord(copilotOptions)) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "copilot",
      message:
        "providerOptions.copilot must be an object when provided for Copilot turns.",
      details: {
        option: "providerOptions.copilot",
      },
      raw: copilotOptions,
    });
  }

  const turnTimeoutMs = copilotOptions.turnTimeoutMs;

  if (turnTimeoutMs === undefined) {
    return {};
  }

  if (
    typeof turnTimeoutMs !== "number" ||
    !Number.isFinite(turnTimeoutMs) ||
    turnTimeoutMs < 0
  ) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "copilot",
      message:
        "providerOptions.copilot.turnTimeoutMs must be a non-negative finite number.",
      details: {
        option: "providerOptions.copilot.turnTimeoutMs",
      },
      raw: turnTimeoutMs,
    });
  }

  return {
    turnTimeoutMs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
