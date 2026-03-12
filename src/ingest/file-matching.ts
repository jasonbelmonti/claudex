import { basename, relative } from "node:path";

import type { DiscoveryRootConfig } from "./discovery";

function normalizeRelativePath(rootPath: string, filePath: string): string {
  const normalized = relative(rootPath, filePath).replaceAll("\\", "/");
  return normalized.length > 0 ? normalized : basename(filePath);
}

function matchesPattern(pattern: string, relativePath: string, fileName: string): boolean {
  const glob = new Bun.Glob(pattern);
  return glob.match(relativePath) || glob.match(fileName);
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
