import { statSync } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

export async function readTextFile(pathOrUrl: string | URL): Promise<string> {
  return readFile(pathOrUrl, "utf8");
}

export async function readJsonFile<T>(pathOrUrl: string | URL): Promise<T> {
  return JSON.parse(await readTextFile(pathOrUrl)) as T;
}

export async function writeTextFile(
  pathOrUrl: string | URL,
  contents: string,
): Promise<void> {
  await writeFile(pathOrUrl, contents);
}

export async function writeJsonFile(
  pathOrUrl: string | URL,
  value: unknown,
): Promise<void> {
  await writeTextFile(pathOrUrl, `${JSON.stringify(value, null, 2)}\n`);
}

export async function getFileSize(pathOrUrl: string | URL): Promise<number> {
  const fileStats = await stat(pathOrUrl);
  return fileStats.size;
}

export function getFileSizeSync(pathOrUrl: string | URL): number {
  return statSync(pathOrUrl).size;
}

export async function sleep(durationMs: number): Promise<void> {
  await delay(durationMs);
}
