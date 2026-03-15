import type { AgentEvent } from "../../core/events";
import type { ObservedEventCompleteness } from "../completeness";
import type { IngestCursor } from "../cursor";
import type {
  ObservedAgentEvent,
  ObservedSessionReason,
  ObservedSessionRecord,
} from "../events";
import type { IngestParseContext } from "../registry";
import type {
  ObservedSessionIdentity,
  ObservedSessionIdentityState,
} from "../session-identity";
import type { ObservedEventSource } from "../source";
import type { IngestWarning } from "../warnings";

export function createCodexIngestCursor(params: {
  context: IngestParseContext;
  byteOffset: number;
  line: number;
  metadata?: Record<string, unknown>;
}): IngestCursor {
  return {
    provider: params.context.root.provider,
    rootPath: params.context.root.path,
    filePath: params.context.filePath,
    byteOffset: params.byteOffset,
    line: params.line,
    metadata: params.metadata,
  };
}

export function createCodexIngestSource(
  context: IngestParseContext,
  location?: {
    line?: number;
    byteOffset?: number;
  },
): ObservedEventSource {
  const source: ObservedEventSource = {
    provider: context.root.provider,
    kind: context.match.kind,
    discoveryPhase: context.discoveryPhase,
    rootPath: context.root.path,
    filePath: context.filePath,
    metadata: context.root.metadata ?? context.match.metadata,
  };

  if (location?.line !== undefined || location?.byteOffset !== undefined) {
    source.location = {
      line: location.line,
      byteOffset: location.byteOffset,
    };
  }

  return source;
}

export function createCodexObservedSessionRecord(params: {
  context: IngestParseContext;
  line: number;
  byteOffset: number;
  metadata?: Record<string, unknown>;
  sessionMetadata?: Record<string, unknown>;
  reason: ObservedSessionReason;
  sessionId: string;
  completeness: ObservedEventCompleteness;
  state?: ObservedSessionIdentityState;
  warnings: IngestWarning[];
}): ObservedSessionRecord {
  return {
    kind: "session",
    observedSession: {
      provider: "codex",
      sessionId: params.sessionId,
      state: params.state ?? "provisional",
      metadata: params.sessionMetadata,
    },
    source: createCodexIngestSource(params.context, {
      line: params.line,
      byteOffset: params.byteOffset,
    }),
    completeness: params.completeness,
    reason: params.reason,
    cursor: createCodexIngestCursor({
      context: params.context,
      byteOffset: params.byteOffset,
      line: params.line,
      metadata: params.metadata,
    }),
    warnings: params.warnings.length > 0 ? params.warnings : undefined,
  };
}

export function createCodexObservedEventRecord(params: {
  context: IngestParseContext;
  line: number;
  byteOffset: number;
  metadata?: Record<string, unknown>;
  event: AgentEvent;
  observedSession: ObservedSessionIdentity | null;
  completeness: ObservedEventCompleteness;
  warnings?: IngestWarning[];
}): ObservedAgentEvent {
  return {
    kind: "event",
    event: params.event,
    source: createCodexIngestSource(params.context, {
      line: params.line,
      byteOffset: params.byteOffset,
    }),
    observedSession: params.observedSession,
    completeness: params.completeness,
    cursor: createCodexIngestCursor({
      context: params.context,
      byteOffset: params.byteOffset,
      line: params.line,
      metadata: params.metadata,
    }),
    warnings: params.warnings,
  };
}

export function withCodexIngestWarnings(
  warnings: IngestWarning[] | undefined,
  source: ObservedEventSource,
): IngestWarning[] {
  return (warnings ?? []).map((warning) => ({
    ...warning,
    provider: warning.provider ?? source.provider,
    filePath: warning.filePath ?? source.filePath,
    source: warning.source ?? source,
  }));
}
