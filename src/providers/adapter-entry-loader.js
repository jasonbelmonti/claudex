import { access } from "node:fs/promises";

export async function loadAdapterEntry(params) {
  const { distAdapterUrl, sourceAdapterPath } = params;

  return (await canAccess(distAdapterUrl))
    ? import(distAdapterUrl)
    : import(sourceAdapterPath);
}

async function canAccess(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
