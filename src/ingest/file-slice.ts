import { open } from "node:fs/promises";

export type FileSlice = {
  size: number;
  bytes: Uint8Array;
};

export async function readFileSlice(
  filePath: string,
  byteOffset = 0,
): Promise<FileSlice> {
  const fileHandle = await open(filePath, "r");

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
