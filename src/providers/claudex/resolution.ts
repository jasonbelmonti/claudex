import type { AgentProviderAdapter, ProviderId } from "../../core/provider.js";
import type { ProviderReadiness } from "../../core/readiness.js";

export type ClaudexResolutionStrategy =
  | "ready"
  | "degraded"
  | "fallback"
  | "pinned";

export type ClaudexResolution = {
  selected: ProviderReadiness;
  selectedAdapter: AgentProviderAdapter;
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
    const adapter = await params.getAdapter(provider);
    adapters.set(provider, adapter);
    const readiness = await adapter.checkReadiness();
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
      selectedAdapter: requireAdapter(adapters, degraded.provider),
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
    selectedAdapter: requireAdapter(adapters, fallback.provider),
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

function requireAdapter(
  adapters: ReadonlyMap<ProviderId, AgentProviderAdapter>,
  provider: ProviderId,
): AgentProviderAdapter {
  const adapter = adapters.get(provider);

  if (!adapter) {
    throw new Error(`Missing adapter for provider ${provider}.`);
  }

  return adapter;
}
