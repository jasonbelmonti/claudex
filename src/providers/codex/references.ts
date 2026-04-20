import type { SessionReference } from "../../core/session.js";

export function createCodexSessionReference(
  sessionId: string | null,
): SessionReference | null {
  if (!sessionId) {
    return null;
  }

  return {
    provider: "codex",
    sessionId,
  };
}
