import { basename, relative } from "node:path";

import type { DiscoveryRootConfig } from "./discovery.js";
import { matchesGlobPattern } from "./glob-matching.js";

function normalizeRelativePath(rootPath: string, filePath: string): string {
  const normalized = relative(rootPath, filePath).replaceAll("\\", "/");
  return normalized.length > 0 ? normalized : basename(filePath);
}

function matchesPattern(pattern: string, relativePath: string, fileName: string): boolean {
  return matchesGlobPattern(pattern, relativePath)
    || matchesGlobPattern(pattern, fileName);
}

export function matchesDiscoveryRootFilters(
  root: DiscoveryRootConfig,
  filePath: string,
): boolean {
  const relativePath = normalizeRelativePath(root.path, filePath);
  const fileName = basename(filePath);

  if (root.include?.length) {
    const included = root.include.some((pattern) =>
      matchesPattern(pattern, relativePath, fileName),
    );

    if (!included) {
      return false;
    }
  }

  if (root.exclude?.length) {
    const excluded = root.exclude.some((pattern) =>
      matchesPattern(pattern, relativePath, fileName),
    );

    if (excluded) {
      return false;
    }
  }

  return true;
}
