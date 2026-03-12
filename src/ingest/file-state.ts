import { stat } from "node:fs/promises";

import type { IngestCursor } from "./cursor";
import { readCursorContinuityToken } from "./cursor-continuity";

export type SourceFileState = {
  size: number;
  fingerprint: string;
  revision: string;
  continuityToken: string | null;
};

export async function readSourceFileState(
  filePath: string,
  cursor: Pick<IngestCursor, "byteOffset"> | null = null,
): Promise<SourceFileState | null> {
  const fileStats = await stat(filePath, { bigint: true }).catch(() => null);

  if (!fileStats?.isFile()) {
    return null;
  }

  const continuityToken = await resolveContinuityToken(
    filePath,
    Number(fileStats.size),
    cursor,
  ).catch(() => undefined);

  if (continuityToken === undefined) {
    return null;
  }

  return {
    size: Number(fileStats.size),
    fingerprint: `${fileStats.dev}:${fileStats.ino}`,
    revision: `${fileStats.mtimeNs}:${fileStats.ctimeNs}:${fileStats.size}`,
    continuityToken,
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
