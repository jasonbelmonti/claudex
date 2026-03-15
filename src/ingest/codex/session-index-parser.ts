import type { ObservedIngestRecord, ObservedSessionRecord } from "../events";
import type { IngestParseContext, IngestProviderRegistry } from "../registry";
import type { IngestWarning } from "../warnings";
import {
  createCodexIngestSource,
  createCodexObservedSessionRecord,
  withCodexIngestWarnings,
} from "./parser-core";

const NEWLINE = 10;
const CARRIAGE_RETURN = 13;

const SESSION_INDEX_FILENAMES = new Set([
  "session-index.jsonl",
  "session_index.jsonl",
]);

type CodexSessionIndexEntry = {
  id?: unknown;
  thread_name?: unknown;
  updated_at?: unknown;
};

export function createCodexSessionIndexIngestRegistry(): IngestProviderRegistry {
  return {
    provider: "codex",
    matchFile(filePath) {
      return SESSION_INDEX_FILENAMES.has(getPathFileName(filePath.toLowerCase()))
        ? { kind: "session-index" }
        : null;
    },
    parseFile: parseCodexSessionIndexFile,
  };
}

export async function* parseCodexSessionIndexFile(
  context: IngestParseContext,
): AsyncIterable<ObservedIngestRecord> {
  const file = Bun.file(context.filePath);
  const cursorStart = context.cursor?.byteOffset ?? 0;

  if (cursorStart >= file.size) {
    return;
  }

  const decoder = new TextDecoder();
  const bytes = new Uint8Array(await file.slice(cursorStart).arrayBuffer());
  let line = (context.cursor?.line ?? 0) + 1;
  let byteOffset = cursorStart;
  let lineStart = 0;
  let pendingRecord: ObservedSessionRecord | null = null;

  for (let index = 0; index <= bytes.length; index += 1) {
    const atEnd = index === bytes.length;
    const atLineBoundary = atEnd || bytes[index] === NEWLINE;

    if (!atLineBoundary) {
      continue;
    }

    const rawLine = bytes.subarray(lineStart, index);
    const trimmedLineBytes = trimTrailingCarriageReturn(rawLine);
    const lineText = decoder.decode(trimmedLineBytes).trim();
    const bytesConsumed = index - lineStart + (atEnd ? 0 : 1);
    const nextByteOffset = byteOffset + bytesConsumed;

    if (lineText.length > 0) {
      if (pendingRecord) {
        yield pendingRecord;
      }

      pendingRecord = parseSessionIndexLine({
        context,
        lineText,
        line,
        byteOffset: nextByteOffset,
      });
    } else if (pendingRecord) {
      pendingRecord = updateSessionRecordProgress({
        context,
        record: pendingRecord,
        line,
        byteOffset: nextByteOffset,
      });
    }

    line += 1;
    byteOffset = nextByteOffset;
    lineStart = index + 1;
  }

  if (pendingRecord) {
    yield pendingRecord;
  }
}

function parseSessionIndexLine(params: {
  context: IngestParseContext;
  lineText: string;
  line: number;
  byteOffset: number;
}): ObservedSessionRecord {
  const source = createCodexIngestSource(params.context, {
    line: params.line,
    byteOffset: params.byteOffset,
  });

  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(params.lineText);
  } catch (cause) {
    return createFallbackSessionRecord({
      context: params.context,
      line: params.line,
      byteOffset: params.byteOffset,
      sessionId: createFallbackSessionId(params.context.filePath, params.line),
      warnings: withCodexIngestWarnings(
        [
          {
            code: "parse-failed",
            message: `Line ${params.line} was invalid JSON`,
            cause,
            raw: params.lineText,
          },
        ],
        source,
      ),
    });
  }

  if (!isRecord(parsedPayload)) {
    return createFallbackSessionRecord({
      context: params.context,
      line: params.line,
      byteOffset: params.byteOffset,
      sessionId: createFallbackSessionId(params.context.filePath, params.line),
      warnings: withCodexIngestWarnings(
        [
          {
            code: "unsupported-record",
            message: `Line ${params.line} did not contain a session-index object`,
            raw: parsedPayload,
          },
        ],
        source,
      ),
    });
  }

  const entry = parsedPayload as CodexSessionIndexEntry;
  const warnings: IngestWarning[] = [];
  const sessionId = readNonEmptyString(entry.id);
  const threadName = readNonEmptyString(entry.thread_name);
  const updatedAt = readValidTimestamp(entry.updated_at);

  if (!sessionId) {
    warnings.push({
      code: "unsupported-record",
      message: `Line ${params.line} was missing a string id`,
      raw: parsedPayload,
    });
  }

  if (!threadName) {
    warnings.push({
      code: "unsupported-record",
      message: `Line ${params.line} was missing a string thread_name`,
      raw: parsedPayload,
    });
  }

  if (readNonEmptyString(entry.updated_at) === null) {
    warnings.push({
      code: "unsupported-record",
      message: `Line ${params.line} was missing a string updated_at`,
      raw: parsedPayload,
    });
  } else if (!updatedAt) {
    warnings.push({
      code: "unsupported-record",
      message: `Line ${params.line} had an invalid updated_at timestamp`,
      raw: parsedPayload,
    });
  }

  const completeWarnings = withCodexIngestWarnings(warnings, source);

  return createCodexObservedSessionRecord({
    context: params.context,
    line: params.line,
    byteOffset: params.byteOffset,
    reason: "index",
    sessionId: sessionId ?? createFallbackSessionId(params.context.filePath, params.line),
    sessionMetadata: createSessionMetadata(threadName, updatedAt),
    completeness: completeWarnings.length > 0 ? "partial" : "best-effort",
    warnings: completeWarnings,
  });
}

function createFallbackSessionRecord(params: {
  context: IngestParseContext;
  line: number;
  byteOffset: number;
  sessionId: string;
  warnings: IngestWarning[];
}): ObservedSessionRecord {
  return createCodexObservedSessionRecord({
    context: params.context,
    line: params.line,
    byteOffset: params.byteOffset,
    reason: "index",
    sessionId: params.sessionId,
    completeness: "partial",
    warnings: params.warnings,
  });
}

function updateSessionRecordProgress(params: {
  context: IngestParseContext;
  record: ObservedSessionRecord;
  line: number;
  byteOffset: number;
}): ObservedSessionRecord {
  return createCodexObservedSessionRecord({
    context: params.context,
    line: params.line,
    byteOffset: params.byteOffset,
    metadata: params.record.cursor?.metadata,
    reason: params.record.reason,
    sessionId: params.record.observedSession.sessionId,
    sessionMetadata: params.record.observedSession.metadata,
    completeness: params.record.completeness,
    state: params.record.observedSession.state,
    warnings: params.record.warnings ?? [],
  });
}

function createFallbackSessionId(filePath: string, line: number): string {
  return `file:${filePath}:line:${line}`;
}

function createSessionMetadata(
  threadName: string | null,
  updatedAt: string | null,
): Record<string, unknown> | undefined {
  const metadata: Record<string, unknown> = {};

  if (threadName) {
    metadata.threadName = threadName;
  }

  if (updatedAt) {
    metadata.updatedAt = updatedAt;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readValidTimestamp(value: unknown): string | null {
  const normalized = readNonEmptyString(value);

  if (!normalized || Number.isNaN(Date.parse(normalized))) {
    return null;
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimTrailingCarriageReturn(line: Uint8Array): Uint8Array {
  if (line.length === 0) {
    return line;
  }

  return line[line.length - 1] === CARRIAGE_RETURN
    ? line.subarray(0, line.length - 1)
    : line;
}

function getPathFileName(filePath: string): string {
  const lastPathSeparator = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );

  return filePath.slice(lastPathSeparator + 1);
}
