import { AgentError } from "../../core/errors.js";
import type { SessionOptions } from "../../core/session.js";

export function validateCopilotSessionOptions(options: SessionOptions): void {
  if (options.additionalDirectories && options.additionalDirectories.length > 0) {
    throw createUnsupportedCopilotSessionOptionError({
      option: "additionalDirectories",
      message:
        "Copilot session configuration does not support normalized additionalDirectories yet.",
    });
  }

  if (options.executionMode === "plan") {
    throw createUnsupportedCopilotSessionOptionError({
      option: "executionMode",
      message:
        "Copilot plan mode is not supported until exit-plan-mode handling is normalized.",
    });
  }

  if (options.sandboxProfile) {
    throw createUnsupportedCopilotSessionOptionError({
      option: "sandboxProfile",
      message:
        "Copilot session configuration does not expose a normalized sandboxProfile mapping yet.",
    });
  }

  if (options.resumeStrategy === "fork") {
    throw createUnsupportedCopilotSessionOptionError({
      option: "resumeStrategy",
      message: "Copilot does not support normalized session forking yet.",
    });
  }
}

export function createUnsupportedCopilotSessionOptionError(params: {
  option: string;
  message: string;
}): AgentError {
  return new AgentError({
    code: "unsupported_feature",
    provider: "copilot",
    message: params.message,
    details: {
      option: params.option,
    },
  });
}
