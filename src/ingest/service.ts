import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery";
import type { CursorStore } from "./cursor";
import type {
  ObservedAgentEvent,
  ObservedIngestRecord,
  ObservedSessionRecord,
} from "./events";
import type { IngestProviderRegistry } from "./registry";
import type { IngestWarning } from "./warnings";

export type IngestRecordHandler = (
  record: ObservedIngestRecord,
) => Promise<void> | void;

export type ObservedEventHandler = (
  observedEvent: ObservedAgentEvent,
) => Promise<void> | void;

export type ObservedSessionHandler = (
  observedSession: ObservedSessionRecord,
) => Promise<void> | void;

export type IngestWarningHandler = (
  warning: IngestWarning,
) => Promise<void> | void;

export type DiscoveryEventHandler = (
  discoveryEvent: DiscoveryEvent,
) => Promise<void> | void;

export type SessionIngestServiceOptions = {
  roots: DiscoveryRootConfig[];
  registries: IngestProviderRegistry[];
  cursorStore?: CursorStore;
  watchIntervalMs?: number;
  onRecord?: IngestRecordHandler;
  onObservedEvent?: ObservedEventHandler;
  onObservedSession?: ObservedSessionHandler;
  onWarning?: IngestWarningHandler;
  onDiscoveryEvent?: DiscoveryEventHandler;
};

export interface SessionIngestService {
  readonly roots: DiscoveryRootConfig[];

  start(): Promise<void>;
  stop(): Promise<void>;
  scanNow(): Promise<void>;
  reconcileNow(): Promise<void>;
}
