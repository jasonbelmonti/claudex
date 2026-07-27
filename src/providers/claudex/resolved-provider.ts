import type { AgentProviderAdapter, ProviderId } from "../../core/provider.js";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session.js";
import { guardAgentSession } from "./guarded-session.js";
import {
  assertProviderIdentity,
  throwIfProviderErrorConflicts,
} from "./provider-identity.js";
import type {
  ResolvedProvider,
  SafeProviderProbe,
} from "./resolved-provider-types.js";
import type { ProviderReadiness } from "../../core/readiness.js";
import { snapshotProviderReadiness } from "./canonical-provider-values.js";

export function createResolvedProvider(params: {
  adapter: AgentProviderAdapter;
  provider: ProviderId;
  probes: readonly SafeProviderProbe[];
  readiness: ProviderReadiness;
}): ResolvedProvider {
  return new ResolvedProviderHandle(
    params.adapter,
    params.provider,
    params.readiness,
    params.probes,
  );
}

class ResolvedProviderHandle implements ResolvedProvider {
  readonly provider: ProviderId;
  readonly capabilities: ProviderReadiness["capabilities"];
  readonly probes: readonly SafeProviderProbe[];
  readonly readiness: ProviderReadiness;

  constructor(
    private readonly adapter: AgentProviderAdapter,
    provider: ProviderId,
    readiness: ProviderReadiness,
    probes: readonly SafeProviderProbe[],
  ) {
    this.provider = provider;
    this.readiness = snapshotProviderReadiness(readiness, provider);
    this.capabilities = this.readiness.capabilities;
    this.probes = Object.freeze([...probes]);
    this.validateAdapter();
  }

  async createSession(
    options: SessionOptions = {},
  ): Promise<AgentSession> {
    this.validateAdapter();

    try {
      return guardAgentSession(
        await this.adapter.createSession(options),
        this.provider,
      );
    } catch (error) {
      throwIfProviderErrorConflicts(this.provider, error);
    }
  }

  async resumeSession(
    reference: SessionReference,
    options: SessionOptions = {},
  ): Promise<AgentSession> {
    assertProviderIdentity(
      this.provider,
      reference.provider,
      "session_reference",
    );
    this.validateAdapter();

    try {
      return guardAgentSession(
        await this.adapter.resumeSession(reference, options),
        this.provider,
      );
    } catch (error) {
      throwIfProviderErrorConflicts(this.provider, error);
    }
  }

  private validateAdapter(): void {
    assertProviderIdentity(
      this.provider,
      this.adapter.provider,
      "adapter",
    );
    assertProviderIdentity(
      this.provider,
      this.adapter.capabilities.provider,
      "adapter_capabilities",
    );
  }
}
