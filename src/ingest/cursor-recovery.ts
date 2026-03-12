import type { IngestCursor } from "./cursor";
import type { SourceFileState } from "./file-state";
import type { ObservedEventSource } from "./source";
import type { IngestWarning } from "./warnings";

export type CursorRecoveryResult = {
  cursor: IngestCursor | null;
  skip: boolean;
  warnings: IngestWarning[];
};

export function resolveCursorRecovery(options: {
  storedCursor: IngestCursor | null;
  fileState: SourceFileState;
  source: ObservedEventSource;
}): CursorRecoveryResult {
  const { storedCursor, fileState, source } = options;

  if (!storedCursor) {
    return {
      cursor: null,
      skip: false,
      warnings: [],
    };
  }

  if (!storedCursor.fingerprint) {
    return {
      cursor: storedCursor,
      skip: false,
      warnings: [],
    };
  }

  if (storedCursor.fingerprint !== fileState.fingerprint) {
    return {
      cursor: null,
      skip: false,
      warnings: [createCursorWarning("rotated-file", "File fingerprint changed; resetting cursor", source)],
    };
  }

  if (storedCursor.byteOffset > fileState.size) {
    return {
      cursor: null,
      skip: false,
      warnings: [createCursorWarning("truncated-file", "File shrank below stored cursor; resetting cursor", source)],
    };
  }

  if (storedCursor.byteOffset === fileState.size) {
    return {
      cursor: storedCursor,
      skip: true,
      warnings: [],
    };
  }

  return {
    cursor: storedCursor,
    skip: false,
    warnings: [],
  };
}

function createCursorWarning(
  code: "rotated-file" | "truncated-file",
  message: string,
  source: ObservedEventSource,
): IngestWarning {
  return {
    code,
    message,
    provider: source.provider,
    filePath: source.filePath,
    source,
  };
}
