import { isAbsolute } from "node:path";

import type { CodexBinaryResolver } from "./types.js";
import {
  findExecutableOnPath,
  pathExists,
} from "./executable-path-resolution.js";

export const resolveCodexBinary: CodexBinaryResolver = async (
  options,
) => {
  const override = options?.codexPathOverride;

  if (!override) {
    return findExecutableOnPath("codex");
  }

  if (isCodexPathOverride(override)) {
    return (await pathExists(override)) ? override : null;
  }

  return findExecutableOnPath(override);
};

export function isCodexPathOverride(value: string): boolean {
  return isAbsolute(value) || value.includes("/") || value.includes("\\");
}
