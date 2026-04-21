import { access } from "node:fs/promises";

export async function loadAdapterEntry(params) {
  const { distAdapterUrl, sourceAdapterUrl } = params;

  if (await canAccess(sourceAdapterUrl)) {
    return import(sourceAdapterUrl);
  }

  return import(distAdapterUrl);
}

async function canAccess(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
