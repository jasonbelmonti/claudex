import type { SessionReference } from "../../core/session";

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
