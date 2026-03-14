import type { ObservedEventCompleteness } from "../completeness";
import type { ObservedIngestRecord } from "../events";
import type { IngestParseContext } from "../registry";
import {
  createCodexIngestSource,
  createCodexObservedEventRecord,
  createCodexObservedSessionRecord,
  withCodexIngestWarnings,
} from "./parser-core";
import {
  createCodexTranscriptNormalizationContext,
  createCodexTranscriptNormalizationMetadata,
  normalizeCodexTranscriptRecord,
} from "./normalize";

const NEWLINE = 10;
const CARRIAGE_RETURN = 13;

export async function* parseCodexTranscriptFile(
  context: IngestParseContext,
): AsyncIterable<ObservedIngestRecord> {
  const baseSource = createCodexIngestSource(context);
  const normalizationContext = createCodexTranscriptNormalizationContext(
    context.cursor?.metadata,
  );
  const file = Bun.file(context.filePath);
  const cursorStart = context.cursor?.byteOffset ?? 0;

  if (cursorStart >= file.size) {
    return;
  }

  const textDecoder = new TextDecoder();
  const bytes = new Uint8Array(await file.slice(cursorStart).arrayBuffer());

  let line = (context.cursor?.line ?? 0) + 1;
  let byteOffset = cursorStart;
  let lineStart = 0;
  let latestDeliveredByteOffset = cursorStart;

  for (let index = 0; index <= bytes.length; index += 1) {
    const atEnd = index === bytes.length;
    const atLineBoundary = atEnd || bytes[index] === NEWLINE;

    if (!atLineBoundary) {
      continue;
    }

    const rawLine = bytes.subarray(lineStart, index);
    const trimmedLine = trimTrailingCarriageReturn(rawLine);
    const lineText = textDecoder.decode(trimmedLine).trim();
    const bytesConsumed = index - lineStart + (atEnd ? 0 : 1);
    const nextByteOffset = byteOffset + bytesConsumed;

    if (lineText.length > 0) {
      const parsedRecords = parseTranscriptLine({
        lineText,
        baseSource,
        context,
        byteOffset: nextByteOffset,
        line,
        normalizationContext,
      });

      for (const parsedRecord of parsedRecords) {
        yield parsedRecord;
      }

      if (parsedRecords.length > 0) {
        latestDeliveredByteOffset = nextByteOffset;
      }
    }

    line += 1;
    byteOffset = nextByteOffset;
    lineStart = index + 1;
  }

  if (byteOffset > latestDeliveredByteOffset) {
    const metadata = createCodexTranscriptNormalizationMetadata(
      normalizationContext,
    );

    if (!shouldEmitProgressSession(normalizationContext, metadata)) {
      return;
    }

    yield createCodexObservedSessionRecord({
      context,
      line: line - 1,
      byteOffset,
      metadata,
      reason: "transcript",
      sessionId: deriveSessionId(normalizationContext, context.filePath),
      completeness: "complete",
      state: normalizationContext.sessionId ? "canonical" : "provisional",
      warnings: [],
    });
  }
}

function parseTranscriptLine(params: {
  lineText: string;
  baseSource: ReturnType<typeof createCodexIngestSource>;
  context: IngestParseContext;
  byteOffset: number;
  line: number;
  normalizationContext: ReturnType<typeof createCodexTranscriptNormalizationContext>;
}): ObservedIngestRecord[] {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(params.lineText);
  } catch (cause) {
    const metadata = createCodexTranscriptNormalizationMetadata(
      params.normalizationContext,
    );
    const warnings = withCodexIngestWarnings(
      [
        {
          code: "parse-failed",
          message: `Line ${params.line} was invalid JSON`,
          cause,
          raw: params.lineText,
        },
      ],
      params.baseSource,
    );

    return [
      createCodexObservedSessionRecord({
        context: params.context,
        line: params.line,
        byteOffset: params.byteOffset,
        metadata,
        reason: "transcript",
        sessionId: deriveSessionId(
          params.normalizationContext,
          params.context.filePath,
        ),
        completeness: "partial",
        warnings,
      }),
    ];
  }

  const normalized = normalizeCodexTranscriptRecord(
    parsedPayload,
    params.normalizationContext,
  );
  const metadata = createCodexTranscriptNormalizationMetadata(
    params.normalizationContext,
  );
  const warnings = withCodexIngestWarnings(normalized.warnings, params.baseSource);

  if (normalized.events.length === 0) {
    if (warnings.length === 0) {
      return [];
    }

    return warnings.map((warning) =>
      createCodexObservedSessionRecord({
        context: params.context,
        line: params.line,
        byteOffset: params.byteOffset,
        metadata,
        reason: "transcript",
        sessionId:
          normalized.sessionId
          ?? deriveSessionId(params.normalizationContext, params.context.filePath),
        completeness: "partial",
        warnings: [warning],
      }),
    );
  }

  return normalized.events.map((event, index) =>
    createCodexObservedEventRecord({
      context: params.context,
      line: params.line,
      byteOffset: params.byteOffset,
      metadata,
      event,
      observedSession: event.session
        ? {
            provider: "codex",
            sessionId: event.session.sessionId,
            state: "canonical",
          }
        : null,
      completeness: selectCompleteness(warnings),
      warnings: index === 0 && warnings.length > 0 ? warnings : undefined,
    }),
  );
}

function deriveSessionId(
  normalizationContext: ReturnType<typeof createCodexTranscriptNormalizationContext>,
  filePath: string,
): string {
  return normalizationContext.sessionId ?? `file:${filePath}`;
}

function shouldEmitProgressSession(
  normalizationContext: ReturnType<typeof createCodexTranscriptNormalizationContext>,
  metadata: Record<string, unknown> | undefined,
): boolean {
  return normalizationContext.sessionId !== null || metadata !== undefined;
}

function selectCompleteness(
  warnings: ReturnType<typeof withCodexIngestWarnings>,
): ObservedEventCompleteness {
  return warnings.length > 0 ? "partial" : "complete";
}

function trimTrailingCarriageReturn(line: Uint8Array): Uint8Array {
  if (line.length === 0) {
    return line;
  }

  return line[line.length - 1] === CARRIAGE_RETURN
    ? line.subarray(0, line.length - 1)
    : line;
}
