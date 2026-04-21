import type { AgentEvent } from "../../core/events.js";
import {
  OBSERVED_EVENT_COMPLETENESS,
  type ObservedEventCompleteness,
} from "../completeness.js";
import type { IngestCursor } from "../cursor.js";
import type {
  IngestParseContext,
  IngestProviderRegistry,
} from "../registry.js";
import type {
  ObservedIngestRecord,
  ObservedSessionRecord,
} from "../events.js";
import type { ObservedEventSource } from "../source.js";
import type { IngestWarning } from "../warnings.js";
import { readFileSlice } from "../file-slice.js";
import {
  createIngestSource,
  withIngestWarnings,
} from "./parser-core.js";
import {
  createClaudeArtifactNormalizationMetadata,
  createClaudeArtifactNormalizationContext,
  getClaudeArtifactWorkingDirectory,
  type ClaudeArtifactNormalizationContext,
  normalizeClaudeArtifactRecord,
} from "./normalize.js";

const NEWLINE = 10;
const CARRIAGE_RETURN = 13;

export function createClaudeTranscriptIngestRegistry(): IngestProviderRegistry {
  return {
    provider: "claude",
    matchFile(filePath) {
      return filePath.toLowerCase().endsWith(".jsonl")
        ? { kind: "transcript" }
        : null;
    },
    parseFile: parseTranscriptFile,
  };
}

export async function* parseTranscriptFile(
  context: IngestParseContext,
): AsyncIterable<ObservedIngestRecord> {
  const source = createSourceBase(context);
  const normalizationContext = createClaudeArtifactNormalizationContext(context.cursor?.metadata);
  const cursorStart = context.cursor?.byteOffset ?? 0;
  const { size, bytes } = await readFileSlice(context.filePath, cursorStart);

  if (cursorStart >= size) {
    return;
  }

  const text = new TextDecoder();

  let line = (context.cursor?.line ?? 0) + 1;
  let byteOffset = cursorStart;
  let lineStart = 0;

  for (let index = 0; index <= bytes.length; index += 1) {
    const atEnd = index === bytes.length;
    const atLineBoundary = atEnd || bytes[index] === NEWLINE;

    if (!atLineBoundary) {
      continue;
    }

    const rawLine = bytes.subarray(lineStart, index);
    const trimmedLineBytes = trimTrailingCarriageReturn(rawLine);
    const lineText = text.decode(trimmedLineBytes).trim();
    const bytesConsumed = index - lineStart + (atEnd ? 0 : 1);
    const nextByteOffset = byteOffset + bytesConsumed;

    if (lineText.length > 0) {
      const parsedRecords = parseTranscriptLine(
        lineText,
        source,
        context,
        nextByteOffset,
        line,
        normalizationContext,
      );

      for (const parsedRecord of parsedRecords) {
        yield parsedRecord;
      }
    }

    line += 1;
    byteOffset = nextByteOffset;
    lineStart = index + 1;
  }
}

function parseTranscriptLine(
  lineText: string,
  baseSource: ObservedEventSource,
  context: IngestParseContext,
  byteOffset: number,
  line: number,
  normalizationContext: ClaudeArtifactNormalizationContext,
): ObservedIngestRecord[] {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(lineText);
  } catch (cause) {
    const warnings = withIngestWarnings([{
      code: "parse-failed",
      message: `Line ${line} was invalid JSON`,
      cause,
      source: baseSource,
      raw: lineText,
    }], baseSource);
    const cursor = createCursor(context, byteOffset, line, normalizationContext);

    return [
      createSessionRecordForWarnings({
        baseSource,
        reason: "transcript",
        warnings,
        cursor,
        sessionId: `file:${baseSource.filePath}`,
        completeness: "partial",
      }),
    ];
  }

  const { events, warnings, sessionId } = normalizeClaudeArtifactRecord(
    parsedPayload,
    normalizationContext,
  );
  const cursor = createCursor(context, byteOffset, line, normalizationContext);
  const completeWarnings = withIngestWarnings(warnings, baseSource);
  if (events.length === 0) {
    return completeWarnings.map((warning) =>
      createSessionRecordForWarnings({
        baseSource,
        reason: "transcript",
        warnings: [warning],
        cursor,
        sessionId: deriveSessionId(sessionId, baseSource.filePath),
        completeness: "partial",
      }),
    );
  }

  return events.map((event: AgentEvent, index) => {
    const sessionIdFromEvent = event.session?.sessionId ?? sessionId;
    const workingDirectory = getClaudeArtifactWorkingDirectory(
      normalizationContext,
      sessionIdFromEvent,
    );

    return {
      kind: "event",
      event,
      source: {
        ...baseSource,
        location: {
          line,
          byteOffset: cursor.byteOffset,
        },
      },
      observedSession: sessionIdFromEvent
        ? ({
            provider: "claude",
            state: "canonical",
            sessionId: sessionIdFromEvent,
            workingDirectory,
          })
        : null,
      completeness: selectCompleteness(completeWarnings),
      cursor,
      warnings: index === 0 ? completeWarnings : undefined,
    };
  });
}

function createSourceBase(context: IngestParseContext): ObservedEventSource {
  return createIngestSource(context);
}

function createSessionRecordForWarnings(params: {
  baseSource: ObservedEventSource;
  reason: "transcript" | "snapshot";
  warnings: IngestWarning[];
  cursor: IngestCursor;
  sessionId: string;
  completeness: ObservedEventCompleteness;
}): ObservedSessionRecord {
  return {
    kind: "session",
    observedSession: {
      provider: "claude",
      state: "provisional",
      sessionId: params.sessionId,
    },
    source: {
      ...params.baseSource,
      location: {
        byteOffset: params.cursor.byteOffset,
      },
    },
    completeness: params.completeness,
    reason: params.reason,
    cursor: params.cursor,
    warnings: params.warnings,
  };
}

function createCursor(
  context: IngestParseContext,
  byteOffset: number,
  line: number,
  normalizationContext: ClaudeArtifactNormalizationContext,
): IngestCursor {
  return {
    provider: context.root.provider,
    rootPath: context.root.path,
    filePath: context.filePath,
    byteOffset,
    line,
    metadata: createClaudeArtifactNormalizationMetadata(normalizationContext),
  };
}

function selectCompleteness(
  warnings: IngestWarning[],
): ObservedEventCompleteness {
  if (warnings.length > 0) {
    return "partial";
  }

  return OBSERVED_EVENT_COMPLETENESS[0] as ObservedEventCompleteness;
}

function deriveSessionId(sessionId: string | undefined, filePath: string): string {
  return sessionId ?? `file:${filePath}`;
}

function trimTrailingCarriageReturn(line: Uint8Array): Uint8Array {
  if (line.length === 0) {
    return line;
  }

  return line[line.length - 1] === CARRIAGE_RETURN
    ? line.subarray(0, line.length - 1)
    : line;
}
