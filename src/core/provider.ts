import type { ProviderCapabilities } from "./capabilities";
import type { ProviderReadiness } from "./readiness";
import type { AgentSession, SessionOptions, SessionReference } from "./session";

export const PROVIDER_IDS = ["claude", "codex"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface AgentProviderAdapter {
  readonly provider: ProviderId;
  readonly capabilities: ProviderCapabilities;

  checkReadiness(): Promise<ProviderReadiness>;
  createSession(options?: SessionOptions): Promise<AgentSession>;
  resumeSession(reference: SessionReference, options?: SessionOptions): Promise<AgentSession>;
}
