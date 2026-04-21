import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { join, relative, sep } from "node:path";

export async function readTextFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf8");
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readTextFile(filePath)) as T;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function listRelativeFiles(params: {
  rootDir: string;
  startDir: string;
  match: (relativePath: string) => boolean;
}): Promise<readonly string[]> {
  const directoryPath = join(params.rootDir, params.startDir);
  const matches: string[] = [];

  await visitDirectory(directoryPath, (absolutePath) => {
    const relativePath = normalizeRelativePath(relative(params.rootDir, absolutePath));

    if (params.match(relativePath)) {
      matches.push(relativePath);
    }
  });

  return matches.sort();
}

async function visitDirectory(
  directoryPath: string,
  visitFile: (absolutePath: string) => void,
): Promise<void> {
  const directoryEntries = await readdir(directoryPath, {
    withFileTypes: true,
  });

  for (const directoryEntry of directoryEntries) {
    const absolutePath = join(directoryPath, directoryEntry.name);

    if (directoryEntry.isDirectory()) {
      await visitDirectory(absolutePath, visitFile);
      continue;
    }

    if (directoryEntry.isFile()) {
      visitFile(absolutePath);
    }
  }
}

function normalizeRelativePath(pathValue: string): string {
  return pathValue.split(sep).join("/");
}
