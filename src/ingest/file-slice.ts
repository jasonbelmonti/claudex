import { open } from "node:fs/promises";

export type FileSlice = {
  size: number;
  bytes: Uint8Array;
};

export async function readFileSlice(
  filePath: string,
  byteOffset = 0,
): Promise<FileSlice> {
  let fileHandle;

  try {
    fileHandle = await open(filePath, "r");
  } catch (error) {
    if (isMissingFileError(error)) {
      return createEmptyFileSlice();
    }

    throw error;
  }

  try {
    const { size } = await fileHandle.stat();

    if (byteOffset >= size) {
      return {
        size,
        bytes: new Uint8Array(),
      };
    }

    const expectedLength = size - byteOffset;
    const buffer = Buffer.allocUnsafe(expectedLength);
    let totalBytesRead = 0;

    while (totalBytesRead < expectedLength) {
      const { bytesRead } = await fileHandle.read(
        buffer,
        totalBytesRead,
        expectedLength - totalBytesRead,
        byteOffset + totalBytesRead,
      );

      if (bytesRead === 0) {
        break;
      }

      totalBytesRead += bytesRead;
    }

    return {
      size,
      bytes: buffer.subarray(0, totalBytesRead),
    };
  } finally {
    await fileHandle.close();
  }
}

function createEmptyFileSlice(): FileSlice {
  return {
    size: 0,
    bytes: new Uint8Array(),
  };
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  return error.code === "ENOENT"
    || error.code === "ENOTDIR"
    || error.code === "EISDIR";
}
