import { resolve } from "node:path";

import type { DiscoveryRootConfig } from "./discovery";

export function getDiscoveryRootIdentityKey(root: DiscoveryRootConfig): string {
  return stableSerializeValue({
    provider: root.provider,
    path: normalizeDiscoveryRootPath(root.path),
    recursive: Boolean(root.recursive),
    watch: Boolean(root.watch),
    include: normalizeGlobList(root.include),
    exclude: normalizeGlobList(root.exclude),
    metadata: root.metadata ?? null,
  });
}

export function normalizeDiscoveryRootPath(rootPath: string): string {
  return resolve(rootPath);
}

export function haveEquivalentDiscoveryRootSemantics(
  left: DiscoveryRootConfig,
  right: DiscoveryRootConfig,
): boolean {
  return Boolean(left.recursive) === Boolean(right.recursive)
    && Boolean(left.watch) === Boolean(right.watch)
    && stableSerializeValue(normalizeGlobList(left.include))
      === stableSerializeValue(normalizeGlobList(right.include))
    && stableSerializeValue(normalizeGlobList(left.exclude))
      === stableSerializeValue(normalizeGlobList(right.exclude))
    && stableSerializeValue(left.metadata ?? null) === stableSerializeValue(right.metadata ?? null);
}

function normalizeGlobList(globs: string[] | undefined): string[] {
  return [...(globs ?? [])].sort((left, right) => left.localeCompare(right));
}

function stableSerializeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerializeValue(entry)).join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));

    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerializeValue(entryValue)}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
