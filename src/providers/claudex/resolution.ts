import type { ProviderCapabilities } from "../../core/capabilities.js";
import { isAgentError } from "../../core/errors.js";
import type { AgentProviderAdapter, ProviderId } from "../../core/provider.js";
import type { ProviderReadiness } from "../../core/readiness.js";

export type ClaudexResolutionStrategy =
  | "ready"
  | "degraded"
  | "fallback"
  | "pinned";

export type ClaudexResolution = {
  selected: ProviderReadiness;
  selectedAdapter: AgentProviderAdapter | null;
  probes: ProviderReadiness[];
  resolution: Exclude<ClaudexResolutionStrategy, "pinned">;
};

export async function probeProvidersInOrder(params: {
  getAdapter: (provider: ProviderId) => Promise<AgentProviderAdapter>;
  preferredProviders: readonly ProviderId[];
}): Promise<ClaudexResolution> {
  const probes: ProviderReadiness[] = [];
  const adapters = new Map<ProviderId, AgentProviderAdapter>();

  for (const provider of params.preferredProviders) {
    let adapter: AgentProviderAdapter;
    try {
      adapter = await params.getAdapter(provider);
    } catch (error) {
      probes.push(createFailedProbe(provider, "adapter_construction", error));
      continue;
    }

    adapters.set(provider, adapter);
    let readiness: ProviderReadiness;
    try {
      readiness = await adapter.checkReadiness();
    } catch (error) {
      probes.push(createFailedProbe(provider, "readiness", error, adapter.capabilities));
      continue;
    }

    probes.push(readiness);

    if (readiness.status === "ready") {
      return {
        selected: readiness,
        selectedAdapter: adapter,
        probes,
        resolution: "ready",
      };
    }
  }

  const degraded = probes.find((probe) => probe.status === "degraded");

  if (degraded) {
    return {
      selected: degraded,
      selectedAdapter: adapters.get(degraded.provider) ?? null,
      probes,
      resolution: "degraded",
    };
  }

  const fallback = probes[0];

  if (!fallback) {
    throw new Error("Expected at least one provider probe.");
  }

  return {
    selected: fallback,
    selectedAdapter: adapters.get(fallback.provider) ?? null,
    probes,
    resolution: "fallback",
  };
}

export function extendReadinessWithResolution(params: {
  readiness: ProviderReadiness;
  preferredProviders: readonly ProviderId[];
  probes: readonly ProviderReadiness[];
  resolution: ClaudexResolutionStrategy;
}): ProviderReadiness {
  return {
    ...params.readiness,
    extensions: {
      ...params.readiness.extensions,
      resolution: {
        preferredProviders: [...params.preferredProviders],
        selectedProvider: params.readiness.provider,
        selectedStatus: params.readiness.status,
        strategy: params.resolution,
        probes: params.probes.map((probe) => ({
          provider: probe.provider,
          status: probe.status,
          checks: probe.checks,
        })),
      },
    },
  };
}

function createFailedProbe(
  provider: ProviderId,
  stage: "adapter_construction" | "readiness",
  error: unknown,
  capabilities: ProviderCapabilities = { provider, features: {} },
): ProviderReadiness {
  const code = isAgentError(error) ? error.code : undefined;
  const status =
    code === "missing_cli"
      ? "missing_cli"
      : code === "needs_auth"
        ? "needs_auth"
        : "error";
  const reason = error instanceof Error ? error.message : String(error);

  return {
    provider,
    status,
    checks: [
      {
        kind: "runtime",
        status: "fail",
        summary:
          stage === "adapter_construction"
            ? `${provider} adapter construction failed`
            : `${provider} readiness check failed`,
        detail: reason,
      },
    ],
    capabilities,
    raw: error,
    extensions: {
      diagnostics: {
        stage,
        ...(code ? { errorCode: code } : {}),
        reason,
      },
    },
  };
}
