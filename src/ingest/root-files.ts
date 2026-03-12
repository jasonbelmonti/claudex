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

  for (const entry of entries.sort((left, right) => compareEntryNames(left.name, right.name))) {
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

function compareEntryNames(leftName: string, rightName: string): number {
  if (leftName === rightName) {
    return 0;
  }

  // Use raw string ordering instead of locale collation so ingest order is
  // identical across environments.
  return leftName < rightName ? -1 : 1;
}
