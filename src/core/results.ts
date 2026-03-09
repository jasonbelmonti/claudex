import type { ProviderId } from "./provider";
import type { SessionReference } from "./session";

export type TokenUsage = {
  input: number;
  output: number;
  cachedInput?: number;
};

export type AgentUsage = {
  tokens: TokenUsage;
  costUsd?: number;
  providerUsage?: Record<string, unknown>;
};

export type TurnResult = {
  provider: ProviderId;
  session: SessionReference | null;
  turnId?: string;
  text: string;
  structuredOutput?: unknown;
  usage: AgentUsage | null;
  stopReason?: string | null;
  raw?: unknown;
  extensions?: Record<string, unknown>;
};
