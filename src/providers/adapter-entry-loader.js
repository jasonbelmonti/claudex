import { access } from "node:fs/promises";

export async function loadAdapterEntry(params) {
  const {
    distAdapterUrl,
    preferSource = typeof Bun !== "undefined",
    sourceAdapterUrl,
  } = params;
  const candidateUrls = preferSource
    ? [sourceAdapterUrl, distAdapterUrl]
    : [distAdapterUrl, sourceAdapterUrl];

  for (const candidateUrl of candidateUrls) {
    if (!candidateUrl || !(await canAccess(candidateUrl))) {
      continue;
    }

    return import(candidateUrl);
  }

  throw new Error("Could not load adapter entry from source or dist.");
}

async function canAccess(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
