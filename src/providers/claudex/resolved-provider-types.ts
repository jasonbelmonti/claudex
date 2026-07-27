import type {
  CapabilityId,
  ProviderCapabilities,
} from "../../core/capabilities.js";
import type { ProviderId } from "../../core/provider.js";
import type {
  ProviderReadiness,
  ReadinessCheckKind,
  ReadinessCheckStatus,
} from "../../core/readiness.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";

export type ResolvedProviderStatus = "ready" | "degraded";

export type ResolveProviderOptions = {
  allowedStatuses?: readonly ResolvedProviderStatus[];
  requiredCapabilities?: readonly CapabilityId[];
};

export type SafeProviderProbeCheck = {
  kind: ReadinessCheckKind;
  status: ReadinessCheckStatus;
  summary: string;
};

export type SafeProviderProbe = {
  provider: ProviderId;
  status: ProviderReadiness["status"];
  checks: readonly SafeProviderProbeCheck[];
};

export interface ResolvedProvider {
  readonly provider: ProviderId;
  readonly readiness: ProviderReadiness;
  readonly capabilities: ProviderCapabilities;
  readonly probes: readonly SafeProviderProbe[];

  createSession(options?: SessionOptions): Promise<AgentSession>;
  resumeSession(
    reference: SessionReference,
    options?: SessionOptions,
  ): Promise<AgentSession>;
}
