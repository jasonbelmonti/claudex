import type { ProviderCapabilities } from "../../core/capabilities";
import type { AgentProviderAdapter, ProviderId } from "../../core/provider";
import type { ClaudeAdapterOptions } from "../claude/types";
import type { CodexAdapterOptions } from "../codex/types";

export type ClaudexAdapterOptions = {
  preferredProviders?: readonly ProviderId[];
  providers?: Partial<Record<ProviderId, AgentProviderAdapter>>;
  claude?: ClaudeAdapterOptions;
  codex?: CodexAdapterOptions;
};

export type ClaudexAdapterMetadata = {
  provider: ProviderId | null;
  capabilities: ProviderCapabilities | null;
};
