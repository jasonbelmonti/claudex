import type { ProviderId } from "../core/provider";
import type { IngestCursor } from "./cursor";
import type { DiscoveryRootConfig } from "./discovery";
import type { ObservedIngestRecord } from "./events";
import type { DiscoveryPhase, ObservedEventSourceKind } from "./source";

export type IngestFileMatch = {
  kind: ObservedEventSourceKind;
  metadata?: Record<string, unknown>;
};

export type IngestParseContext = {
  root: DiscoveryRootConfig;
  filePath: string;
  discoveryPhase: DiscoveryPhase;
  cursor: IngestCursor | null;
};

export interface IngestProviderRegistry {
  readonly provider: ProviderId;

  matchFile(filePath: string, root: DiscoveryRootConfig): IngestFileMatch | null;
  parseFile(
    context: IngestParseContext,
  ): AsyncIterable<ObservedIngestRecord> | Promise<AsyncIterable<ObservedIngestRecord>>;
}
