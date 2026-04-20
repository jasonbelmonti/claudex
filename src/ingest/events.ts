import type { AgentEvent } from "../core/events.js";
import type { IngestCursor } from "./cursor.js";
import type { ObservedEventCompleteness } from "./completeness.js";
import type { ObservedSessionIdentity } from "./session-identity.js";
import type { ObservedEventSource } from "./source.js";
import type { IngestWarning } from "./warnings.js";

export type ObservedAgentEvent = {
  kind: "event";
  event: AgentEvent;
  source: ObservedEventSource;
  observedSession: ObservedSessionIdentity | null;
  completeness: ObservedEventCompleteness;
  cursor?: IngestCursor;
  warnings?: IngestWarning[];
};

export const OBSERVED_SESSION_REASONS = [
  "bootstrap",
  "index",
  "snapshot",
  "transcript",
  "reconcile",
] as const;

export type ObservedSessionReason = (typeof OBSERVED_SESSION_REASONS)[number];

export type ObservedSessionRecord = {
  kind: "session";
  observedSession: ObservedSessionIdentity;
  source: ObservedEventSource;
  completeness: ObservedEventCompleteness;
  reason: ObservedSessionReason;
  cursor?: IngestCursor;
  warnings?: IngestWarning[];
};

export type ObservedIngestRecord = ObservedAgentEvent | ObservedSessionRecord;
