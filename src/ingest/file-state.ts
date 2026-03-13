import { stat } from "node:fs/promises";

import type { IngestCursor } from "./cursor";
import { readCursorContinuityToken } from "./cursor-continuity";

export type SourceFileState = {
  size: number;
  fingerprint: string;
  continuityToken: string | null;
  modifiedAtMs: number;
};

export async function readSourceFileState(
  filePath: string,
  cursor: Pick<IngestCursor, "byteOffset"> | null = null,
): Promise<SourceFileState | null> {
  const fileStats = await stat(filePath).catch(() => null);

  if (!fileStats?.isFile()) {
    return null;
  }

  const continuityToken = await resolveContinuityToken(
    filePath,
    fileStats.size,
    cursor,
  ).catch(() => undefined);

  if (continuityToken === undefined) {
    return null;
  }

  return {
    size: fileStats.size,
    fingerprint: `${fileStats.dev}:${fileStats.ino}`,
    continuityToken,
    modifiedAtMs: Number(fileStats.mtimeMs),
  };
}

async function resolveContinuityToken(
  filePath: string,
  fileSize: number,
  cursor: Pick<IngestCursor, "byteOffset"> | null,
): Promise<string | null> {
  if (!cursor || cursor.byteOffset <= 0 || cursor.byteOffset > fileSize) {
    return null;
  }

  return readCursorContinuityToken(filePath, cursor.byteOffset);
}
