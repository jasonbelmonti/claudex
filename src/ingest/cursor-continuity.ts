import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

const CURSOR_CONTINUITY_WINDOW_BYTES = 64;

export async function readCursorContinuityToken(
  filePath: string,
  byteOffset: number,
): Promise<string | null> {
  if (byteOffset <= 0) {
    return null;
  }

  const windowStart = Math.max(0, byteOffset - CURSOR_CONTINUITY_WINDOW_BYTES);
  const windowSize = byteOffset - windowStart;
  const fileHandle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(windowSize);
    const { bytesRead } = await fileHandle.read(buffer, 0, windowSize, windowStart);

    if (bytesRead !== windowSize) {
      throw new Error("Failed to read cursor continuity window");
    }

    return createHash("sha256").update(buffer).digest("hex");
  } finally {
    await fileHandle.close();
  }
}
