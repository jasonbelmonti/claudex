import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, join } from "node:path";

export async function findExecutableOnPath(
  command: string,
): Promise<string | null> {
  const pathValue = process.env.PATH;

  if (!pathValue) {
    return null;
  }

  for (const directory of pathValue.split(delimiter)) {
    for (const candidate of getPathCandidates(directory || ".", command)) {
      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

export async function pathIsFile(
  path: string,
): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function getPathCandidates(directory: string, command: string): string[] {
  const extensions = getExecutableExtensions(command);

  return extensions.map((extension) => join(directory, `${command}${extension}`));
}

function getExecutableExtensions(command: string): string[] {
  if (process.platform !== "win32" || /\.[^/\\]+$/.test(command)) {
    return [""];
  }

  const pathExt = process.env.PATHEXT;

  return (pathExt ? pathExt.split(";") : [".EXE", ".CMD", ".BAT", ".COM"])
    .filter(Boolean)
    .map((extension) => extension.toLowerCase());
}

async function isExecutableFile(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
