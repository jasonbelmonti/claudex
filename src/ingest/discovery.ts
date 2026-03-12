import type { ProviderId } from "../core/provider";
import type { DiscoveryPhase } from "./source";

export const DISCOVERY_EVENT_TYPES = [
  "scan.started",
  "scan.completed",
  "file.discovered",
  "file.changed",
  "file.deleted",
  "root.skipped",
] as const;

export type DiscoveryEventType = (typeof DISCOVERY_EVENT_TYPES)[number];

export type DiscoveryRootConfig = {
  provider: ProviderId;
  path: string;
  recursive?: boolean;
  include?: string[];
  exclude?: string[];
  watch?: boolean;
  metadata?: Record<string, unknown>;
};

export type DiscoveryEvent = {
  type: DiscoveryEventType;
  provider: ProviderId;
  rootPath: string;
  discoveryPhase: DiscoveryPhase;
  filePath?: string;
  detail?: string;
  raw?: unknown;
};
