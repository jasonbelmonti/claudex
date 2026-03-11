import type { ProviderId } from "../core/provider";

export const OBSERVED_SESSION_IDENTITY_STATES = [
  "canonical",
  "provisional",
] as const;

export type ObservedSessionIdentityState =
  (typeof OBSERVED_SESSION_IDENTITY_STATES)[number];

export type ObservedSessionIdentity = {
  provider: ProviderId;
  sessionId: string;
  state: ObservedSessionIdentityState;
  workingDirectory?: string;
  metadata?: Record<string, unknown>;
};
