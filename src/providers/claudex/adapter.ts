import { AgentError } from "../../core/errors";
import type { ProviderCapabilities } from "../../core/capabilities";
import {
  PROVIDER_IDS,
  type AgentProviderAdapter,
  type ProviderId,
} from "../../core/provider";
import type { ProviderReadiness } from "../../core/readiness";
import type {
  AgentSession,
  SessionOptions,
  SessionReference,
} from "../../core/session";
import { createNoRunnableProviderError } from "./errors";
import { createProviderAdapters } from "./factory";
import {
  extendReadinessWithResolution,
  probeProvidersInOrder,
} from "./resolution";
import type { ClaudexAdapterOptions } from "./types";

export const DEFAULT_CLAUDEX_PROVIDER_ORDER = [
  "codex",
  "claude",
] as const satisfies readonly ProviderId[];

const VALID_PROVIDER_IDS = new Set<string>(PROVIDER_IDS);

function normalizePreferredProviders(
  preferredProviders?: readonly ProviderId[],
): readonly ProviderId[] {
  const configured =
    preferredProviders && preferredProviders.length > 0
      ? preferredProviders
      : DEFAULT_CLAUDEX_PROVIDER_ORDER;

  const invalidProviders = configured.filter(
    (provider) => !VALID_PROVIDER_IDS.has(provider),
  );

  if (invalidProviders.length > 0) {
    throw new AgentError({
      code: "provider_failure",
      provider: DEFAULT_CLAUDEX_PROVIDER_ORDER[0],
      message: `ClaudexAdapter preferredProviders contains unsupported providers: ${invalidProviders.join(", ")}.`,
      details: {
        invalidPreferredProviders: [...invalidProviders],
        supportedProviders: [...PROVIDER_IDS],
        configuredPreferredProviders: [...configured],
      },
    });
  }

  return [...new Set(configured)];
}

export class ClaudexAdapter {
  readonly preferredProviders: readonly ProviderId[];

  private readonly adapters: Record<ProviderId, AgentProviderAdapter>;
  private resolvedAdapter: AgentProviderAdapter | null = null;

  constructor(readonly options: ClaudexAdapterOptions = {}) {
    this.preferredProviders = normalizePreferredProviders(
      options.preferredProviders,
    );
    this.adapters = createProviderAdapters(options);
  }

  get provider(): ProviderId | null {
    return this.resolvedAdapter?.provider ?? null;
  }

  get capabilities(): ProviderCapabilities | null {
    return this.resolvedAdapter?.capabilities ?? null;
  }

  async checkReadiness(): Promise<ProviderReadiness> {
    if (this.resolvedAdapter) {
      return this.resolvedAdapter.checkReadiness();
    }

    const resolution = await probeProvidersInOrder({
      adapters: this.adapters,
      preferredProviders: this.preferredProviders,
    });

    if (
      resolution.selected.status === "ready" ||
      resolution.selected.status === "degraded"
    ) {
      this.pinAdapter(resolution.selectedAdapter);
    }

    return extendReadinessWithResolution({
      readiness: resolution.selected,
      preferredProviders: this.preferredProviders,
      probes: resolution.probes,
      resolution: resolution.resolution,
    });
  }

  async createSession(options: SessionOptions = {}): Promise<AgentSession> {
    const adapter = await this.resolveRunnableAdapter();
    return adapter.createSession(options);
  }

  async resumeSession(
    reference: SessionReference,
    options: SessionOptions = {},
  ): Promise<AgentSession> {
    if (this.resolvedAdapter) {
      if (this.resolvedAdapter.provider !== reference.provider) {
        throw new AgentError({
          code: "unsupported_feature",
          provider: this.resolvedAdapter.provider,
          message: `ClaudexAdapter is pinned to ${this.resolvedAdapter.provider} and cannot resume a ${reference.provider} session.`,
          details: {
            pinnedProvider: this.resolvedAdapter.provider,
            requestedProvider: reference.provider,
          },
        });
      }

      return this.resolvedAdapter.resumeSession(reference, options);
    }

    const adapter = this.adapters[reference.provider];
    this.pinAdapter(adapter);

    return adapter.resumeSession(reference, options);
  }

  private async resolveRunnableAdapter(): Promise<AgentProviderAdapter> {
    if (this.resolvedAdapter) {
      return this.resolvedAdapter;
    }

    const resolution = await probeProvidersInOrder({
      adapters: this.adapters,
      preferredProviders: this.preferredProviders,
    });

    if (
      resolution.selected.status !== "ready" &&
      resolution.selected.status !== "degraded"
    ) {
      throw createNoRunnableProviderError({
        selected: resolution.selected,
        preferredProviders: this.preferredProviders,
        probes: resolution.probes,
      });
    }

    this.pinAdapter(resolution.selectedAdapter);
    return resolution.selectedAdapter;
  }

  private pinAdapter(adapter: AgentProviderAdapter): void {
    this.resolvedAdapter = adapter;
  }
}
