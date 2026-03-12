import { createHash } from "node:crypto";
import { open } from "node:fs/promises";

const CURSOR_CONTINUITY_CHUNK_BYTES = 64 * 1024;

export async function readCursorContinuityToken(
  filePath: string,
  byteOffset: number,
): Promise<string | null> {
  if (byteOffset <= 0) {
    return null;
  }

  const fileHandle = await open(filePath, "r");

  try {
    return hashFilePrefix(fileHandle, byteOffset);
  } finally {
    await fileHandle.close();
  }
}

async function hashFilePrefix(
  fileHandle: Awaited<ReturnType<typeof open>>,
  byteOffset: number,
): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.alloc(Math.min(CURSOR_CONTINUITY_CHUNK_BYTES, byteOffset));
  let bytesRemaining = byteOffset;
  let position = 0;

  while (bytesRemaining > 0) {
    const bytesToRead = Math.min(buffer.length, bytesRemaining);
    const { bytesRead } = await fileHandle.read(buffer, 0, bytesToRead, position);

    if (bytesRead !== bytesToRead) {
      throw new Error("Failed to read the full cursor continuity prefix");
    }

    hash.update(buffer.subarray(0, bytesRead));
    position += bytesRead;
    bytesRemaining -= bytesRead;
  }

  return hash.digest("hex");
}
