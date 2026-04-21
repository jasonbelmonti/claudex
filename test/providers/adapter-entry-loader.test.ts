import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "#test-support";

import { loadAdapterEntry } from "../../src/providers/adapter-entry-loader.js";

test("loadAdapterEntry prefers dist when source files are not the active runtime target", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "claudex-adapter-loader-"));
  const distPath = join(tempDir, "adapter.mjs");
  const sourcePath = join(tempDir, "adapter.ts");

  try {
    writeFileSync(distPath, "export const marker = 'dist';\n");
    writeFileSync(sourcePath, "export const marker = 'source';\n");

    const adapterModule = await loadAdapterEntry({
      distAdapterUrl: pathToFileURL(distPath),
      sourceAdapterUrl: pathToFileURL(sourcePath),
      preferSource: false,
    });

    expect(adapterModule.marker).toBe("dist");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("loadAdapterEntry prefers source when source loading is supported", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "claudex-adapter-loader-"));
  const distPath = join(tempDir, "adapter.mjs");
  const sourcePath = join(tempDir, "adapter.ts");

  try {
    writeFileSync(distPath, "export const marker = 'dist';\n");
    writeFileSync(sourcePath, "export const marker = 'source';\n");

    const adapterModule = await loadAdapterEntry({
      distAdapterUrl: pathToFileURL(distPath),
      sourceAdapterUrl: pathToFileURL(sourcePath),
      preferSource: true,
    });

    expect(adapterModule.marker).toBe("source");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
