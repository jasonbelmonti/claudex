import type { ProviderId } from "../core/provider";

export const OBSERVED_EVENT_SOURCE_KINDS = [
  "transcript",
  "snapshot",
  "session-index",
] as const;

export type ObservedEventSourceKind =
  (typeof OBSERVED_EVENT_SOURCE_KINDS)[number];

export const DISCOVERY_PHASES = [
  "initial_scan",
  "watch",
  "reconcile",
] as const;

export type DiscoveryPhase = (typeof DISCOVERY_PHASES)[number];

export type ObservedEventLocation = {
  line?: number;
  byteOffset?: number;
};

export type ObservedEventSource = {
  provider: ProviderId;
  kind: ObservedEventSourceKind;
  discoveryPhase: DiscoveryPhase;
  rootPath: string;
  filePath: string;
  location?: ObservedEventLocation;
  metadata?: Record<string, unknown>;
};
