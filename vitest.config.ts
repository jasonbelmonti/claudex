import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@jasonbelmonti/claudex/ingest",
        replacement: fileURLToPath(
          new URL("./src/ingest/index.ts", import.meta.url),
        ),
      },
      {
        find: "@jasonbelmonti/claudex",
        replacement: fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      },
    ],
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["test/**/*.test.ts", "test/**/*.smoke.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
  },
});
