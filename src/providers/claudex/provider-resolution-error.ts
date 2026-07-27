import {
  AgentError,
  type AgentErrorOptions,
} from "../../core/errors.js";
import type { CapabilityId } from "../../core/capabilities.js";
import type {
  ResolvedProviderStatus,
  SafeProviderProbe,
} from "./resolved-provider-types.js";
import { snapshotSafeProviderProbe } from "./safe-probes.js";

type ProviderResolutionErrorOptions = AgentErrorOptions & {
  allowedStatuses: readonly ResolvedProviderStatus[];
  missingCapabilities?: readonly CapabilityId[];
  probes: readonly SafeProviderProbe[];
  requiredCapabilities: readonly CapabilityId[];
};

export class ProviderResolutionError extends AgentError {
  readonly allowedStatuses: readonly ResolvedProviderStatus[];
  readonly missingCapabilities: readonly CapabilityId[];
  readonly probes: readonly SafeProviderProbe[];
  readonly requiredCapabilities: readonly CapabilityId[];

  constructor(options: ProviderResolutionErrorOptions) {
    super(options);
    this.allowedStatuses = Object.freeze([...options.allowedStatuses]);
    this.missingCapabilities = Object.freeze([...(options.missingCapabilities ?? [])]);
    this.probes = Object.freeze(options.probes.map(snapshotSafeProviderProbe));
    this.requiredCapabilities = Object.freeze([...options.requiredCapabilities]);
  }
}

export function isProviderResolutionError(error: unknown): error is ProviderResolutionError {
  return error instanceof ProviderResolutionError;
}
