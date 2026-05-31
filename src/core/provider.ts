import type { ProviderCapabilities } from "./capabilities.js";
import type { ProviderReadiness } from "./readiness.js";
import type { AgentSession, SessionOptions, SessionReference } from "./session.js";

export const PROVIDER_IDS = ["claude", "codex", "copilot"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface AgentProviderAdapter {
  readonly provider: ProviderId;
  readonly capabilities: ProviderCapabilities;

  checkReadiness(): Promise<ProviderReadiness>;
  createSession(options?: SessionOptions): Promise<AgentSession>;
  resumeSession(reference: SessionReference, options?: SessionOptions): Promise<AgentSession>;
}
