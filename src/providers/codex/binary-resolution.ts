import { isAbsolute } from "node:path";

import type { CodexBinaryResolver } from "./types.js";

export const resolveCodexBinary: CodexBinaryResolver = async (
  options,
) => {
  const override = options?.codexPathOverride;

  if (!override) {
    return Bun.which("codex") ?? null;
  }

  if (isCodexPathOverride(override)) {
    return (await Bun.file(override).exists()) ? override : null;
  }

  return Bun.which(override) ?? null;
};

export function isCodexPathOverride(value: string): boolean {
  return isAbsolute(value) || value.includes("/") || value.includes("\\");
}
