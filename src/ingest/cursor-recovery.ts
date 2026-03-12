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
      // Legacy cursors cannot prove continuity with the current file, so
      // fail safe during migration and reparse from the beginning once.
      cursor: null,
      skip: false,
      warnings: [
        createCursorWarning(
          "cursor-reset",
          "Stored cursor is missing a file fingerprint; resetting cursor",
          source,
        ),
      ],
    };
  }

  if (storedCursor.byteOffset > 0 && !storedCursor.continuityToken) {
    return {
      cursor: null,
      skip: false,
      warnings: [
        createCursorWarning(
          "cursor-reset",
          "Stored cursor is missing continuity state; resetting cursor",
          source,
        ),
      ],
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

  if (
    storedCursor.byteOffset > 0 &&
    storedCursor.continuityToken &&
    storedCursor.continuityToken !== fileState.continuityToken
  ) {
    return {
      cursor: null,
      skip: false,
      warnings: [
        createCursorWarning(
          "cursor-reset",
          "File contents before the stored cursor changed; resetting cursor",
          source,
        ),
      ],
    };
  }

  if (storedCursor.byteOffset === fileState.size) {
    const storedModifiedAtMs = readStoredModifiedAtMs(storedCursor);

    if (storedModifiedAtMs !== null && storedModifiedAtMs !== fileState.modifiedAtMs) {
      return {
        cursor: null,
        skip: false,
        warnings: [
          createCursorWarning(
            "cursor-reset",
            "File changed in place at the stored cursor; resetting cursor",
            source,
          ),
        ],
      };
    }

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
  code: "cursor-reset" | "rotated-file" | "truncated-file",
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

function readStoredModifiedAtMs(cursor: IngestCursor): number | null {
  const modifiedAtMs = cursor.metadata?.modifiedAtMs;

  return typeof modifiedAtMs === "number" ? modifiedAtMs : null;
}
