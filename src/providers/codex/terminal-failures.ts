import { AgentError } from "../../core/errors.js";
import type { SessionReference } from "../../core/session.js";

export type CodexTerminalFailureKind =
  | "completed_without_agent_message"
  | "stream_ended_without_terminal";

const failureMessages: Record<CodexTerminalFailureKind, string> = {
  completed_without_agent_message:
    "Codex completed without a nonblank assistant message.",
  stream_ended_without_terminal:
    "Codex stream ended without a terminal turn event.",
};

export function createCodexTerminalFailure(options: {
  failureKind: CodexTerminalFailureKind;
  session: SessionReference | null;
  raw?: unknown;
}): AgentError {
  const sessionId =
    options.session?.provider === "codex"
      ? options.session.sessionId
      : undefined;

  return new AgentError({
    code: "provider_failure",
    provider: "codex",
    message: failureMessages[options.failureKind],
    details: {
      failureKind: options.failureKind,
      ...(sessionId ? { sessionId } : {}),
    },
    raw: options.raw,
  });
}
