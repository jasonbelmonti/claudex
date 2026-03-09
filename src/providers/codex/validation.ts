import { AgentError } from "../../core/errors";
import type { SessionOptions } from "../../core/session";

export function validateCodexSessionOptions(
  options: SessionOptions,
  operation: "create" | "resume",
): void {
  if (options.instructions?.trim()) {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "codex",
      message:
        "Codex session-level instructions are not supported by the stable thread API yet.",
    });
  }

  if (options.resumeStrategy === "fork") {
    throw new AgentError({
      code: "unsupported_feature",
      provider: "codex",
      message: `Codex does not support session forking during ${operation}.`,
    });
  }
}
