import {
  CAPABILITY_CATALOG,
  supportsCapability,
  type CapabilityId,
} from "../../core/capabilities.js";
import { AgentError, isAgentError } from "../../core/errors.js";
import type {
  AgentProviderAdapter,
  ProviderId,
} from "../../core/provider.js";
import type {
  ProviderReadiness,
  ProviderReadinessStatus,
} from "../../core/readiness.js";
import {
  assertProviderIdentity,
  throwIfProviderErrorConflicts,
} from "./provider-identity.js";
import { snapshotProviderReadiness } from "./canonical-provider-values.js";
import { ProviderResolutionError } from "./provider-resolution-error.js";
import type {
  ResolvedProviderStatus,
  ResolveProviderOptions,
  SafeProviderProbe,
} from "./resolved-provider-types.js";
import {
  createSafeFailureProbe,
  toSafeProviderProbe,
} from "./safe-probes.js";

const DEFAULT_ALLOWED_STATUSES = ["ready"] as const;
const RUNNABLE_STATUSES = new Set<string>(["ready", "degraded"]);
const CAPABILITY_IDS = new Set<string>(
  CAPABILITY_CATALOG.map((capability) => capability.id),
);

export type ResolvedProviderBoundary = {
  adapter: AgentProviderAdapter;
  provider: ProviderId;
  readiness: ProviderReadiness;
  probes: readonly SafeProviderProbe[];
};

export async function resolveProviderBoundary(params: {
  getAdapter: (provider: ProviderId) => Promise<AgentProviderAdapter>;
  options?: ResolveProviderOptions;
  preferredProviders: readonly ProviderId[];
}): Promise<ResolvedProviderBoundary> {
  const options = normalizeResolveProviderOptions(
    params.options,
    params.preferredProviders[0] ?? "codex",
  );
  const probes: SafeProviderProbe[] = [];
  let firstCapabilityRejection:
    | {
        missingCapabilities: CapabilityId[];
        readiness: ProviderReadiness;
      }
    | undefined;

  for (const provider of params.preferredProviders) {
    let adapter: AgentProviderAdapter;

    try {
      adapter = await params.getAdapter(provider);
    } catch (error) {
      if (isAgentError(error) && error.provider !== provider) {
        throwIfProviderErrorConflicts(provider, error);
      }
      probes.push(createSafeFailureProbe(provider, "adapter_construction"));
      continue;
    }

    assertProviderIdentity(provider, adapter.provider, "adapter");
    assertProviderIdentity(
      provider,
      adapter.capabilities.provider,
      "adapter_capabilities",
    );

    let readiness: ProviderReadiness;

    try {
      readiness = await adapter.checkReadiness();
    } catch (error) {
      if (isAgentError(error) && error.provider !== provider) {
        throwIfProviderErrorConflicts(provider, error);
      }
      probes.push(createSafeFailureProbe(provider, "readiness"));
      continue;
    }

    readiness = snapshotProviderReadiness(readiness, provider);
    probes.push(toSafeProviderProbe(readiness));

    if (
      !options.allowedStatuses.some(
        (allowedStatus) => allowedStatus === readiness.status,
      )
    ) {
      continue;
    }

    const missingCapabilities = options.requiredCapabilities.filter(
      (capability) =>
        !supportsCapability(readiness.capabilities, capability),
    );

    if (missingCapabilities.length > 0) {
      firstCapabilityRejection ??= {
        missingCapabilities,
        readiness,
      };
      continue;
    }

    return {
      adapter,
      provider,
      readiness,
      probes: Object.freeze([...probes]),
    };
  }

  throw createResolutionRejection({
    allowedStatuses: options.allowedStatuses,
    capabilityRejection: firstCapabilityRejection,
    preferredProviders: params.preferredProviders,
    probes,
    requiredCapabilities: options.requiredCapabilities,
  });
}

function normalizeResolveProviderOptions(
  options: ResolveProviderOptions | undefined,
  errorProvider: ProviderId,
): {
  allowedStatuses: readonly ResolvedProviderStatus[];
  requiredCapabilities: readonly CapabilityId[];
} {
  const allowedStatuses = [
    ...new Set(options?.allowedStatuses ?? DEFAULT_ALLOWED_STATUSES),
  ];
  const requiredCapabilities = [
    ...new Set(options?.requiredCapabilities ?? []),
  ];
  const invalidStatuses = allowedStatuses.filter(
    (status) => !RUNNABLE_STATUSES.has(status),
  );
  const invalidCapabilities = requiredCapabilities.filter(
    (capability) => !CAPABILITY_IDS.has(capability),
  );

  if (
    allowedStatuses.length === 0 ||
    invalidStatuses.length > 0 ||
    invalidCapabilities.length > 0
  ) {
    throw new AgentError({
      code: "provider_failure",
      provider: errorProvider,
      message: "Claudex resolve options contain unsupported admission values.",
      details: {
        stage: "readiness",
        allowedStatuses,
        invalidStatuses,
        requiredCapabilities,
        invalidCapabilities,
      },
    });
  }

  return {
    allowedStatuses,
    requiredCapabilities,
  };
}

function createResolutionRejection(params: {
  allowedStatuses: readonly ResolvedProviderStatus[];
  capabilityRejection:
    | {
        missingCapabilities: CapabilityId[];
        readiness: ProviderReadiness;
      }
    | undefined;
  preferredProviders: readonly ProviderId[];
  probes: readonly SafeProviderProbe[];
  requiredCapabilities: readonly CapabilityId[];
}): ProviderResolutionError {
  const selectedProbe = params.capabilityRejection?.readiness
    ? toSafeProviderProbe(params.capabilityRejection.readiness)
    : params.probes[0];
  const provider =
    selectedProbe?.provider ?? params.preferredProviders[0] ?? "codex";
  const status = selectedProbe?.status ?? "error";
  const code = params.capabilityRejection
    ? "unsupported_feature"
    : mapReadinessStatusToErrorCode(status);
  const details = {
    stage: "readiness",
    preferredProviders: [...params.preferredProviders],
    allowedStatuses: [...params.allowedStatuses],
    requiredCapabilities: [...params.requiredCapabilities],
    ...(params.capabilityRejection
      ? {
          missingCapabilities: [
            ...params.capabilityRejection.missingCapabilities,
          ],
        }
      : {}),
    probes: [...params.probes],
  };

  return new ProviderResolutionError({
    allowedStatuses: params.allowedStatuses,
    code,
    details,
    extensions: {
      resolution: details,
    },
    message: params.capabilityRejection
      ? `Provider '${provider}' does not satisfy the required capabilities.`
      : `Claudex could not resolve a provider with an allowed readiness status.`,
    missingCapabilities:
      params.capabilityRejection?.missingCapabilities,
    probes: params.probes,
    provider,
    requiredCapabilities: params.requiredCapabilities,
  });
}

function mapReadinessStatusToErrorCode(
  status: ProviderReadinessStatus,
): "missing_cli" | "needs_auth" | "provider_failure" {
  if (status === "missing_cli") {
    return "missing_cli";
  }
  if (status === "needs_auth") {
    return "needs_auth";
  }
  return "provider_failure";
}
