import type { AgentEvent } from "../core/events";
import type { IngestCursor } from "./cursor";
import type { ObservedEventCompleteness } from "./completeness";
import type { ObservedSessionIdentity } from "./session-identity";
import type { ObservedEventSource } from "./source";
import type { IngestWarning } from "./warnings";

export type ObservedAgentEvent = {
  event: AgentEvent;
  source: ObservedEventSource;
  observedSession: ObservedSessionIdentity | null;
  completeness: ObservedEventCompleteness;
  cursor?: IngestCursor;
  warnings?: IngestWarning[];
};
