import type { AgentProviderAdapter, ProviderId } from "../../core/provider";
import type { ProviderReadiness } from "../../core/readiness";

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
  adapters: Record<ProviderId, AgentProviderAdapter>;
  preferredProviders: readonly ProviderId[];
}): Promise<ClaudexResolution> {
  const probes: ProviderReadiness[] = [];

  for (const provider of params.preferredProviders) {
    const readiness = await params.adapters[provider].checkReadiness();
    probes.push(readiness);

    if (readiness.status === "ready") {
      return {
        selected: readiness,
        selectedAdapter: params.adapters[provider],
        probes,
        resolution: "ready",
      };
    }
  }

  const degraded = probes.find((probe) => probe.status === "degraded");

  if (degraded) {
    return {
      selected: degraded,
      selectedAdapter: params.adapters[degraded.provider],
      probes,
      resolution: "degraded",
    };
  }

  return {
    selected: probes[0]!,
    selectedAdapter: params.adapters[probes[0]!.provider],
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
