import { AgentError } from "../../core/errors";
import type { SessionOptions } from "../../core/session";

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
