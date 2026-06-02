import { AgentError, isAgentError } from "../../core/errors.js";

export function normalizeCopilotRunError(
  error: unknown,
  options: {
    fallbackMessage: string;
    signal?: AbortSignal;
  },
): AgentError {
  if (isAgentError(error)) {
    return error;
  }

  if (options.signal?.aborted || isAbortLikeError(error)) {
    return createCopilotAbortedError(error);
  }

  const message = getErrorMessage(error) ?? options.fallbackMessage;

  return new AgentError({
    code: classifyCopilotErrorCode(message),
    provider: "copilot",
    message,
    cause: error,
    raw: error,
  });
}

export function createCopilotAbortedError(cause?: unknown): AgentError {
  return new AgentError({
    code: "aborted",
    provider: "copilot",
    message: "Copilot turn was aborted.",
    cause,
    raw: cause,
  });
}

export function createCopilotTurnTimeoutError(timeoutMs: number): AgentError {
  return new AgentError({
    code: "provider_failure",
    provider: "copilot",
    message: `Timeout after ${timeoutMs}ms waiting for Copilot session.idle.`,
    details: {
      timeoutMs,
    },
  });
}

export function createCopilotProviderError(params: {
  fallbackMessage: string;
  raw?: unknown;
}): AgentError {
  return new AgentError({
    code: "provider_failure",
    provider: "copilot",
    message: params.fallbackMessage,
    raw: params.raw,
  });
}

function classifyCopilotErrorCode(message: string): AgentError["code"] {
  if (/auth|login|log in|oauth|token|not authenticated/i.test(message)) {
    return "needs_auth";
  }

  return "provider_failure";
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
