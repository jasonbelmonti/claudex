import { AgentError } from "../../core/errors.js";
import type { SessionOptions } from "../../core/session.js";

export function validateClaudeSessionOptions(options: SessionOptions): void {
  if (options.executionMode !== "plan" && options.sandboxProfile) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "claude",
      message:
        "Stable Claude query() sessions cannot safely normalize sandbox profiles yet.",
    });
  }
}
