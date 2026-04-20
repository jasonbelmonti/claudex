import type { SessionReference } from "../../core/session.js";

export function createClaudeSessionReference(
  sessionId: string | null | undefined,
): SessionReference | null {
  if (!sessionId) {
    return null;
  }

  return {
    provider: "claude",
    sessionId,
  };
}
