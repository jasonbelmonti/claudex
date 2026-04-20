import type { DiscoveryEvent, DiscoveryRootConfig } from "./discovery.js";
import type { CursorStore } from "./cursor.js";
import type {
  ObservedAgentEvent,
  ObservedIngestRecord,
  ObservedSessionRecord,
} from "./events.js";
import type { IngestProviderRegistry } from "./registry.js";
import type { IngestWarning } from "./warnings.js";

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

  /**
   * Performs an initial scan across all active roots, then starts watch processing
   * only for roots configured with `watch: true`.
   */
  start(): Promise<void>;
  /** Stops active watch processing and emits watch shutdown events for watched roots. */
  stop(): Promise<void>;
  /** Performs an immediate full scan across all active roots. */
  scanNow(): Promise<void>;
  /** Reconciles current filesystem state across all active roots. */
  reconcileNow(): Promise<void>;
}
