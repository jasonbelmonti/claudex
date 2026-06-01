import { AgentError } from "../../core/errors.js";
import type { TurnInput } from "../../core/input.js";
import type {
  CopilotMessageOptions,
  CopilotTurnProviderOptions,
} from "./types.js";

export const DEFAULT_COPILOT_TURN_TIMEOUT_MS = 60_000;

export function mapTurnInputToCopilotMessage(
  input: TurnInput,
): CopilotMessageOptions {
  if (input.attachments?.length) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "copilot",
      message:
        "Copilot image attachment normalization is deferred until image input is verified end-to-end.",
    });
  }

  return {
    prompt: input.prompt,
  };
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
