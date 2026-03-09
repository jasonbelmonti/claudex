import { AbortError } from "@anthropic-ai/claude-agent-sdk";

import { AgentError, isAgentError } from "../../core/errors";

export function normalizeClaudeError(
  error: unknown,
  options: {
    fallbackMessage: string;
    signal?: AbortSignal;
  },
): AgentError {
  if (isAgentError(error)) {
    return error;
  }

  if (options.signal?.aborted || error instanceof AbortError || isAbortLikeError(error)) {
    return new AgentError({
      code: "aborted",
      provider: "claude",
      message: "Claude turn was aborted.",
      cause: error,
      raw: error,
    });
  }

  const message = getErrorMessage(error) ?? options.fallbackMessage;

  return new AgentError({
    code: classifyClaudeErrorCode(message),
    provider: "claude",
    message,
    cause: error,
    raw: error,
  });
}

export function classifyClaudeErrorCode(message: string): AgentError["code"] {
  if (looksLikeMissingClaudeCli(message)) {
    return "missing_cli";
  }

  if (looksLikeClaudeNeedsAuth(message)) {
    return "needs_auth";
  }

  return "provider_failure";
}

export function looksLikeClaudeNeedsAuth(message: string): boolean {
  return /auth|login|log in|setup-token|oauth|subscription|required/i.test(
    message,
  );
}

export function looksLikeMissingClaudeCli(message: string): boolean {
  return /enoent|not found|no such file|spawn/i.test(message);
}

function isAbortLikeError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "AbortError"
  );
}

function getErrorMessage(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}
