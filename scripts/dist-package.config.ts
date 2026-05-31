import type { Options } from "tsup";

const DIST_PACKAGE_ENTRYPOINTS = {
  index: "src/index.ts",
  "ingest/index": "src/ingest/index.ts",
  "providers/claude/adapter": "src/providers/claude/adapter.ts",
  "providers/codex/adapter": "src/providers/codex/adapter.ts",
};

const DIST_PACKAGE_EXTERNALS = [
  "@anthropic-ai/claude-agent-sdk",
  "@openai/codex-sdk",
  "ajv",
];

export const DIST_PACKAGE_BUILD_CONFIG: Options = {
  bundle: true,
  clean: true,
  entry: DIST_PACKAGE_ENTRYPOINTS,
  external: DIST_PACKAGE_EXTERNALS,
  format: ["esm"],
  outDir: "dist",
  platform: "node",
  splitting: true,
  target: "node20",
};
