import type { ObservedEventCompleteness } from "../completeness";
import type { IngestCursor } from "../cursor";
import type { IngestParseContext } from "../registry";
import type { AgentEvent } from "../../core/events";
import type { ObservedSessionIdentity, ObservedSessionIdentityState } from "../session-identity";
import type { ObservedEventSource, ObservedEventSourceKind } from "../source";
import type { ObservedAgentEvent, ObservedIngestRecord, ObservedSessionRecord, ObservedSessionReason } from "../events";
import type { IngestWarning } from "../warnings";

export const CLAUDE_INGEST_COMPLETENESS: ObservedEventCompleteness = "best-effort";

export function createIngestCursor(
  context: IngestParseContext,
  byteOffset: number,
  line: number,
): IngestCursor {
  return {
    provider: context.root.provider,
    rootPath: context.root.path,
    filePath: context.filePath,
    byteOffset,
    line,
  };
}

export function createIngestSource(
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

export function createObservedSessionIdentity(
  sessionId: string,
  state: ObservedSessionIdentityState = "canonical",
): ObservedSessionIdentity {
  return {
    provider: "claude",
    sessionId,
    state,
  };
}

export function createObservedSessionRecord(
  params: {
    context: IngestParseContext;
    sourceKind: ObservedEventSourceKind;
    line: number;
    byteOffset: number;
    reason: ObservedSessionReason;
    sessionId: string;
    completeness?: ObservedEventCompleteness;
    sessionState?: ObservedSessionIdentityState;
    warnings?: IngestWarning[];
  },
): ObservedSessionRecord {
  const cursor = createIngestCursor(params.context, params.byteOffset, params.line);
  const source = createIngestSource(params.context, {
    line: params.line,
    byteOffset: params.byteOffset,
  });

  return {
    kind: "session",
    observedSession: createObservedSessionIdentity(params.sessionId, params.sessionState ?? "provisional"),
    source: { ...source, kind: params.sourceKind },
    completeness: params.completeness ?? CLAUDE_INGEST_COMPLETENESS,
    reason: params.reason,
    cursor,
    warnings: params.warnings,
  };
}

export function createObservedEventRecord(params: {
  context: IngestParseContext;
  sourceKind: ObservedEventSourceKind;
  line: number;
  byteOffset: number;
  event: AgentEvent;
  observedSession: ObservedSessionIdentity | null;
  completeness?: ObservedEventCompleteness;
  warnings?: IngestWarning[];
}): ObservedAgentEvent {
  const cursor = createIngestCursor(params.context, params.byteOffset, params.line);
  const source = createIngestSource(params.context, {
    line: params.line,
    byteOffset: params.byteOffset,
  });

  return {
    kind: "event",
    event: params.event,
    source: { ...source, kind: params.sourceKind },
    observedSession: params.observedSession,
    completeness: params.completeness ?? CLAUDE_INGEST_COMPLETENESS,
    cursor,
    warnings: params.warnings,
  };
}

export function withIngestWarnings(
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

export function toObservedRecordIterable(
  records: Iterable<ObservedIngestRecord>,
): AsyncIterable<ObservedIngestRecord> {
  return (async function* () {
    for (const record of records) {
      yield record;
    }
  })();
}
