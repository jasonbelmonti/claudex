import type { ProviderId } from "../core/provider.js";
import type { IngestCursor } from "./cursor.js";
import type { DiscoveryRootConfig } from "./discovery.js";
import type { ObservedIngestRecord } from "./events.js";
import type { DiscoveryPhase, ObservedEventSourceKind } from "./source.js";

export type IngestFileMatch = {
  kind: ObservedEventSourceKind;
  metadata?: Record<string, unknown>;
};

export type IngestParseContext = {
  root: DiscoveryRootConfig;
  filePath: string;
  discoveryPhase: DiscoveryPhase;
  cursor: IngestCursor | null;
  match: IngestFileMatch;
};

export interface IngestProviderRegistry {
  readonly provider: ProviderId;

  matchFile(filePath: string, root: DiscoveryRootConfig): IngestFileMatch | null;
  parseFile(
    context: IngestParseContext,
  ): AsyncIterable<ObservedIngestRecord> | Promise<AsyncIterable<ObservedIngestRecord>>;
}
