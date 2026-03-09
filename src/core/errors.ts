import type { ProviderId } from "./provider";

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
  return error instanceof AgentError;
}
