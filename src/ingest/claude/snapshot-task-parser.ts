import type { AgentEvent } from "../../core/events";
import {
  OBSERVED_EVENT_COMPLETENESS,
  type ObservedEventCompleteness,
} from "../completeness";
import type { IngestCursor } from "../cursor";
import type {
  IngestParseContext,
  IngestProviderRegistry,
} from "../registry";
import type { ObservedIngestRecord } from "../events";
import {
  createIngestCursor,
  createObservedEventRecord,
  createObservedSessionRecord,
  withIngestWarnings,
} from "./parser-core";
import type { ObservedEventSource } from "../source";
import type { IngestWarning } from "../warnings";
import {
  createClaudeArtifactNormalizationContext,
  normalizeClaudeArtifactRecord,
} from "./normalize";

type ArtifactRecordContainer = {
  type?: unknown;
  records?: unknown;
  events?: unknown;
  snapshot?: unknown;
};

const CLAUDE_ARTIFACT_TYPES = new Set([
  "assistant",
  "stream_event",
  "result",
  "auth_status",
  "tool_progress",
  "system",
  "snapshot",
  "task",
]);

export function createClaudeSnapshotTaskIngestRegistry(): IngestProviderRegistry {
  return {
    provider: "claude",
    matchFile(filePath) {
      return filePath.toLowerCase().endsWith(".json")
        ? { kind: "snapshot" }
        : null;
    },
    parseFile: parseSnapshotTaskFile,
  };
}

export async function* parseSnapshotTaskFile(
  context: IngestParseContext,
): AsyncIterable<ObservedIngestRecord> {
  const source = createSourceBase(context);
  const normalizationContext = createClaudeArtifactNormalizationContext();
  const file = Bun.file(context.filePath);
  const cursorStart = context.cursor?.byteOffset ?? 0;

  if (cursorStart >= file.size) {
    return;
  }

  const bytes = new Uint8Array(await file.slice(cursorStart).arrayBuffer());
  const payloadText = new TextDecoder().decode(bytes).trim();

  if (payloadText.length === 0) {
    return;
  }

  const nextByteOffset = cursorStart + bytes.length;
  const line = (context.cursor?.line ?? 0) + 1;
  const cursor = createIngestCursor(context, nextByteOffset, line);
  const parsedPayload = parseSnapshotPayload(payloadText);

  if (!parsedPayload) {
    yield createSessionRecordForWarnings({
      baseSource: source,
      reason: "snapshot",
      warnings: [{
        code: "parse-failed",
        message: "Snapshot/task payload was invalid JSON.",
        source,
        raw: payloadText,
      }],
      cursor,
      sessionId: `file:${context.filePath}`,
      completeness: "partial",
    });
    return;
  }

  const {
    records: artifactRecords,
    isClaudeArtifactPayload,
  } = extractArtifactRecords(parsedPayload);

  if (!isClaudeArtifactPayload) {
    return;
  }

  if (artifactRecords.length === 0) {
    yield createSessionRecordForWarnings({
      baseSource: source,
      reason: "snapshot",
      warnings: [{
        code: "unsupported-record",
        message: "Snapshot/task payload did not contain any Claude artifact records.",
        source,
        raw: parsedPayload,
      }],
      cursor,
      sessionId: `file:${context.filePath}`,
      completeness: "partial",
    });
    return;
  }

  for (const record of artifactRecords) {
    const { events, warnings, sessionId } = normalizeClaudeArtifactRecord(record, normalizationContext);
    const completeWarnings = withIngestWarnings(warnings, source);

    if (events.length === 0) {
      for (const warning of completeWarnings) {
        yield createSessionRecordForWarnings({
          baseSource: source,
          reason: "snapshot",
          warnings: [warning],
          cursor,
          sessionId: deriveSessionId(sessionId, context.filePath),
          completeness: "partial",
        });
      }

      continue;
    }

    for (const [index, event] of events.entries()) {
      yield createObservedEventRecord({
        context,
        sourceKind: "snapshot",
        line,
        byteOffset: cursor.byteOffset,
        event,
        observedSession: createObservedSessionIdentityFromEvent(event, sessionId),
        completeness: selectCompleteness(completeWarnings),
        warnings: index === 0 && completeWarnings.length > 0 ? completeWarnings : undefined,
      });
    }
  }
}

function createObservedSessionIdentityFromEvent(
  event: AgentEvent,
  fallbackSessionId: string | undefined,
): { provider: "claude"; sessionId: string; state: "canonical" | "provisional" } | null {
  const sessionId = event.session?.sessionId ?? fallbackSessionId;

  if (!sessionId) {
    return null;
  }

  return {
    provider: "claude",
    sessionId,
    state: "canonical",
  };
}

function parseSnapshotPayload(payloadText: string): unknown | null {
  try {
    return JSON.parse(payloadText);
  } catch {
    return null;
  }
}

function extractArtifactRecords(payload: unknown): {
  records: unknown[];
  isClaudeArtifactPayload: boolean;
} {
  if (Array.isArray(payload)) {
    return {
      records: payload,
      isClaudeArtifactPayload: payload.some(isClaudeArtifactCandidate),
    };
  }

  if (!isRecord(payload)) {
    return {
      records: [],
      isClaudeArtifactPayload: false,
    };
  }

  const recordsFromContainer = extractRecordArray(payload);
  if (recordsFromContainer !== undefined) {
    return {
      records: recordsFromContainer,
      isClaudeArtifactPayload:
        isClaudeArtifactContainer(payload)
        || recordsFromContainer.some(isClaudeArtifactCandidate),
    };
  }

  return isClaudeArtifactCandidate(payload)
    ? {
        records: [payload],
        isClaudeArtifactPayload: true,
      }
    : {
        records: [],
        isClaudeArtifactPayload: false,
      };
}

function extractRecordArray(payload: ArtifactRecordContainer | unknown): unknown[] | undefined {
  if (!isRecord(payload)) {
    return;
  }

  if (Array.isArray(payload.records)) {
    return payload.records;
  }

  if (Array.isArray(payload.events)) {
    return payload.events;
  }

  if (isRecord(payload.snapshot) && Array.isArray(payload.snapshot.records)) {
    return payload.snapshot.records;
  }

  if (isRecord(payload.snapshot) && Array.isArray(payload.snapshot.events)) {
    return payload.snapshot.events;
  }

  return;
}

function isClaudeArtifactContainer(payload: ArtifactRecordContainer): boolean {
  return payload.type === "snapshot"
    || payload.type === "task"
    || (isRecord(payload.snapshot)
      && (Array.isArray(payload.snapshot.records) || Array.isArray(payload.snapshot.events)));
}

function isClaudeArtifactCandidate(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  return CLAUDE_ARTIFACT_TYPES.has(value.type)
    || value.session_id !== undefined
    || value.sessionId !== undefined
    || value.uuid !== undefined;
}

function selectCompleteness(
  warnings: IngestWarning[],
): ObservedEventCompleteness {
  if (warnings.length > 0) {
    return "partial";
  }

  return OBSERVED_EVENT_COMPLETENESS[0] as ObservedEventCompleteness;
}

function createSessionRecordForWarnings(params: {
  baseSource: ObservedEventSource;
  reason: "snapshot" | "transcript";
  warnings: IngestWarning[];
  cursor: IngestCursor;
  sessionId: string;
  completeness: ObservedEventCompleteness;
}): ObservedIngestRecord {
  return createObservedSessionRecord({
    context: {
      root: {
        provider: params.baseSource.provider,
        path: params.baseSource.rootPath,
      },
      filePath: params.baseSource.filePath,
      discoveryPhase: params.baseSource.discoveryPhase,
      cursor: null,
      match: {
        kind: "snapshot",
        metadata: params.baseSource.metadata,
      },
    },
    sourceKind: "snapshot",
    line: params.cursor.line,
    byteOffset: params.cursor.byteOffset,
    reason: params.reason,
    sessionId: params.sessionId,
    sessionState: "provisional",
    warnings: params.warnings,
    completeness: params.completeness,
  });
}

function deriveSessionId(sessionId: string | undefined, filePath: string): string {
  return sessionId ?? `file:${filePath}`;
}

function createSourceBase(context: IngestParseContext): ObservedEventSource {
  return {
    provider: context.root.provider,
    kind: context.match.kind,
    discoveryPhase: context.discoveryPhase,
    rootPath: context.root.path,
    filePath: context.filePath,
    metadata: context.match.metadata,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
