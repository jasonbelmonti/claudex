import type { ProviderCapabilities } from "../../core/capabilities.js";
import type { AgentProviderAdapter, ProviderId } from "../../core/provider.js";

// Keep nested provider configuration opaque on the root surface so strict
// consumers can import ClaudexAdapter without inheriting provider SDK types.
export type ClaudexNestedProviderOptions = Readonly<Record<string, unknown>>;

export type ClaudexAdapterOptions = {
  preferredProviders?: readonly ProviderId[];
  providers?: Partial<Record<ProviderId, AgentProviderAdapter>>;
  claude?: ClaudexNestedProviderOptions;
  codex?: ClaudexNestedProviderOptions;
};

export type ClaudexAdapterMetadata = {
  provider: ProviderId | null;
  capabilities: ProviderCapabilities | null;
};
