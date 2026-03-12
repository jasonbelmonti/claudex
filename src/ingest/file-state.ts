import { stat } from "node:fs/promises";

export type SourceFileState = {
  size: number;
  fingerprint: string;
};

export async function readSourceFileState(filePath: string): Promise<SourceFileState | null> {
  const fileStats = await stat(filePath).catch(() => null);

  if (!fileStats?.isFile()) {
    return null;
  }

  return {
    size: fileStats.size,
    fingerprint: `${fileStats.dev}:${fileStats.ino}`,
  };
}
