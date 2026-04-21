import type { ProviderId } from "./provider.js";

export type AgentErrorCode =
  | "aborted"
  | "missing_cli"
  | "needs_auth"
  | "permission_denied"
  | "provider_failure"
  | "structured_output_invalid"
  | "unsupported_feature"
  | "unknown";

export type AgentErrorDetails = Readonly<Record<string, unknown>>;

export type AgentErrorOptions = {
  code: AgentErrorCode;
  provider: ProviderId;
  message: string;
  cause?: unknown;
  details?: AgentErrorDetails;
  raw?: unknown;
  extensions?: Record<string, unknown>;
};

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly provider: ProviderId;
  readonly details?: AgentErrorDetails;
  readonly raw?: unknown;
  readonly extensions?: Record<string, unknown>;

  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== AgentError) {
      return Function.prototype[Symbol.hasInstance].call(this, value);
    }

    return isAgentErrorLike(value);
  }

  constructor(options: AgentErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);

    this.name = "AgentError";
    this.code = options.code;
    this.provider = options.provider;
    this.details = options.details;
    this.raw = options.raw;
    this.extensions = options.extensions;
  }
}

export function isAgentError(error: unknown): error is AgentError {
  return isAgentErrorLike(error);
}

function isAgentErrorLike(error: unknown): error is AgentError {
  if (!(error instanceof Error)) {
    return false;
  }

  if (error.name !== "AgentError") {
    return false;
  }

  const candidate = error as Partial<AgentError>;

  return (
    typeof candidate.code === "string" &&
    typeof candidate.provider === "string"
  );
}
