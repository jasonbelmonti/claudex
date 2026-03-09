import type { SessionReference } from "../../core/session";

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
