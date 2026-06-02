import { AgentError } from "../../core/errors.js";
import type { SessionReference } from "../../core/session.js";

export function createCopilotSessionReference(
  sessionId: string,
): SessionReference {
  return {
    provider: "copilot",
    sessionId,
  };
}

export function assertCopilotSessionReference(
  reference: SessionReference,
): asserts reference is SessionReference & { provider: "copilot" } {
  if (reference.provider === "copilot") {
    return;
  }

  throw new AgentError({
    code: "unsupported_feature",
    provider: "copilot",
    message: `CopilotAdapter cannot resume a ${reference.provider} session reference.`,
    details: {
      expectedProvider: "copilot",
      receivedProvider: reference.provider,
      sessionId: reference.sessionId,
    },
  });
}
