import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery";
import type { CursorStore } from "./cursor";
import type { ObservedAgentEvent } from "./events";
import type { IngestWarning } from "./warnings";

export type ObservedEventHandler = (
  observedEvent: ObservedAgentEvent,
) => Promise<void> | void;

export type IngestWarningHandler = (
  warning: IngestWarning,
) => Promise<void> | void;

export type DiscoveryEventHandler = (
  discoveryEvent: DiscoveryEvent,
) => Promise<void> | void;

export type SessionIngestServiceOptions = {
  roots: DiscoveryRootConfig[];
  cursorStore?: CursorStore;
  onObservedEvent?: ObservedEventHandler;
  onWarning?: IngestWarningHandler;
  onDiscoveryEvent?: DiscoveryEventHandler;
};

export interface SessionIngestService {
  readonly roots: DiscoveryRootConfig[];

  start(): Promise<void>;
  stop(): Promise<void>;
  scanNow(): Promise<void>;
}
