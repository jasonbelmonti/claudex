import { AgentError } from "../../core/errors.js";
import type { ProviderId } from "../../core/provider.js";
import type {
  ProviderReadiness,
  ProviderReadinessStatus,
  ReadinessCheck,
} from "../../core/readiness.js";

type ReadinessProbeSummary = {
  provider: ProviderId;
  status: ProviderReadinessStatus;
  checks: ReadinessCheck[];
};

export function createNoRunnableProviderError(params: {
  selected: ProviderReadiness;
  preferredProviders: readonly ProviderId[];
  probes: readonly ProviderReadiness[];
}): AgentError {
  return new AgentError({
    code: mapReadinessStatusToErrorCode(params.selected.status),
    provider: params.selected.provider,
    message: `ClaudexAdapter could not resolve a runnable provider. Selected ${params.selected.provider} readiness status was ${params.selected.status}.`,
    details: {
      preferredProviders: [...params.preferredProviders],
      selectedProvider: params.selected.provider,
      selectedStatus: params.selected.status,
      probes: params.probes.map(toProbeSummary),
    },
    raw: params.probes,
    extensions: {
      resolution: {
        preferredProviders: [...params.preferredProviders],
        selectedProvider: params.selected.provider,
        selectedStatus: params.selected.status,
        probes: params.probes.map(toProbeSummary),
      },
    },
  });
}

function mapReadinessStatusToErrorCode(status: ProviderReadinessStatus) {
  switch (status) {
    case "missing_cli":
      return "missing_cli";
    case "needs_auth":
      return "needs_auth";
    default:
      return "provider_failure";
  }
}

function toProbeSummary(readiness: ProviderReadiness): ReadinessProbeSummary {
  return {
    provider: readiness.provider,
    status: readiness.status,
    checks: readiness.checks,
  };
}
