import { AgentError, isAgentError } from "../../core/errors";

export function normalizeCodexRunError(
  error: unknown,
  options: {
    signal?: AbortSignal;
    fallbackMessage: string;
  },
): AgentError {
  if (isAgentError(error)) {
    return error;
  }

  if (options.signal?.aborted || isAbortLikeError(error)) {
    return new AgentError({
      code: "aborted",
      provider: "codex",
      message: "Codex turn was aborted.",
      cause: error,
      raw: error,
    });
  }

  return new AgentError({
    code: "provider_failure",
    provider: "codex",
    message: getErrorMessage(error) ?? options.fallbackMessage,
    cause: error,
    raw: error,
  });
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
