import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import type { DiscoveryRootConfig } from "./discovery";
import { matchesDiscoveryRootFilters } from "./file-matching";

export async function listDiscoveryRootFiles(
  root: DiscoveryRootConfig,
): Promise<string[] | null> {
  const rootStats = await stat(root.path).catch(() => null);

  if (!rootStats) {
    return null;
  }

  if (rootStats.isFile()) {
    return matchesDiscoveryRootFilters(root, root.path) ? [root.path] : [];
  }

  if (!rootStats.isDirectory()) {
    return null;
  }

  const files = await collectDirectoryFiles(root.path, root.recursive ?? true);
  return files.filter((filePath) => matchesDiscoveryRootFilters(root, filePath));
}

async function collectDirectoryFiles(
  directoryPath: string,
  recursive: boolean,
): Promise<string[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isFile()) {
      files.push(entryPath);
      continue;
    }

    if (!recursive || !entry.isDirectory()) {
      continue;
    }

    files.push(...(await collectDirectoryFiles(entryPath, recursive)));
  }

  return files;
}
