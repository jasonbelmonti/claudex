import {
  isAgentError,
  type AgentError,
} from "../../core/errors.js";
import type { ProviderId } from "../../core/provider.js";

export const PROVIDER_IDENTITY_SOURCES = [
  "adapter",
  "adapter_capabilities",
  "readiness",
  "readiness_capabilities",
  "session",
  "session_capabilities",
  "session_reference",
  "result",
  "result_session",
  "error",
  "event",
  "event_session",
  "event_reference",
  "terminal_result",
  "terminal_result_session",
  "terminal_error",
] as const;

export type ProviderIdentitySource =
  (typeof PROVIDER_IDENTITY_SOURCES)[number];

export type ProviderIdentityConflict = {
  resolvedProvider: ProviderId;
  observedProvider: ProviderId;
  observedSource: ProviderIdentitySource;
};

export class ProviderIdentityConflictError extends Error {
  readonly conflict: ProviderIdentityConflict;

  constructor(
    conflict: ProviderIdentityConflict,
    options: ErrorOptions = {},
  ) {
    super(identityConflictMessage(conflict), options);
    this.name = "ProviderIdentityConflictError";
    this.conflict = Object.freeze({ ...conflict });
  }
}

export function isProviderIdentityConflictError(
  error: unknown,
): error is ProviderIdentityConflictError {
  return error instanceof ProviderIdentityConflictError;
}

export function assertProviderIdentity(
  resolvedProvider: ProviderId,
  observedProvider: ProviderId,
  observedSource: ProviderIdentitySource,
): void {
  if (observedProvider === resolvedProvider) {
    return;
  }

  throw providerIdentityConflict({
    observedProvider,
    observedSource,
    resolvedProvider,
  });
}

export function throwIfProviderErrorConflicts(
  resolvedProvider: ProviderId,
  error: unknown,
  observedSource: Extract<
    ProviderIdentitySource,
    "error" | "terminal_error"
  > = "error",
): never {
  assertProviderErrorIdentity(
    resolvedProvider,
    error,
    observedSource,
  );

  if (isAgentError(error)) {
    throw canonicalizeProviderError(
      resolvedProvider,
      error,
      observedSource,
    );
  }

  throw error;
}

export function canonicalizeProviderError(
  resolvedProvider: ProviderId,
  error: AgentError,
  observedSource: Extract<
    ProviderIdentitySource,
    "error" | "terminal_error"
  > = "error",
): AgentError {
  assertProviderErrorIdentity(
    resolvedProvider,
    error,
    observedSource,
  );
  return pinProviderError(error, resolvedProvider);
}

export function assertProviderErrorIdentity(
  resolvedProvider: ProviderId,
  error: unknown,
  observedSource: Extract<
    ProviderIdentitySource,
    "error" | "terminal_error"
  > = "error",
): void {
  if (isProviderIdentityConflictError(error)) {
    throw error;
  }

  if (isAgentError(error) && error.provider !== resolvedProvider) {
    throw providerIdentityConflict(
      {
        observedProvider: error.provider,
        observedSource,
        resolvedProvider,
      },
      error,
    );
  }
}

function providerIdentityConflict(
  conflict: ProviderIdentityConflict,
  cause?: unknown,
): ProviderIdentityConflictError {
  return new ProviderIdentityConflictError(
    conflict,
    cause === undefined ? {} : { cause },
  );
}

function pinProviderError(
  error: AgentError,
  provider: ProviderId,
): AgentError {
  try {
    Object.defineProperty(error, "provider", {
      configurable: false,
      enumerable:
        Object.getOwnPropertyDescriptor(error, "provider")?.enumerable ??
        true,
      value: provider,
      writable: false,
    });
    return error;
  } catch {
    // A non-configurable accessor cannot be pinned in place. Fall back to a
    // detached canonical error so contradictory identity cannot escape.
  }

  const descriptors: Record<PropertyKey, PropertyDescriptor> =
    Object.getOwnPropertyDescriptors(error);
  descriptors.provider = {
    configurable: false,
    enumerable: true,
    value: provider,
    writable: false,
  };

  return Object.freeze(
    Object.create(Object.getPrototypeOf(error), descriptors),
  ) as AgentError;
}

function identityConflictMessage(
  conflict: ProviderIdentityConflict,
): string {
  const observation = {
    adapter: "the selected adapter identified as",
    adapter_capabilities: "the adapter capabilities came from",
    readiness: "the readiness result came from",
    readiness_capabilities: "the readiness capabilities came from",
    session: "the session used",
    session_capabilities: "the session capabilities came from",
    session_reference: "the session reference came from",
    result: "the result came from",
    result_session: "the result session came from",
    error: "the provider error came from",
    event: "the streamed event came from",
    event_session: "the streamed event session came from",
    event_reference: "the streamed session reference came from",
    terminal_result: "the streamed terminal result came from",
    terminal_result_session:
      "the streamed terminal result session came from",
    terminal_error: "the streamed terminal error came from",
  }[conflict.observedSource];

  return `Claudex resolved '${conflict.resolvedProvider}', but ${observation} '${conflict.observedProvider}'.`;
}
