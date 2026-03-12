import { resolve, sep } from "node:path";

import type { DiscoveryRootConfig } from "./discovery";

export type SkippedDiscoveryRoot = {
  root: DiscoveryRootConfig;
  duplicateOf: DiscoveryRootConfig;
  detail: string;
};

export function resolveActiveDiscoveryRoots(roots: DiscoveryRootConfig[]): {
  activeRoots: DiscoveryRootConfig[];
  skippedRoots: SkippedDiscoveryRoot[];
} {
  let activeRoots: DiscoveryRootConfig[] = [];
  const skippedRoots: SkippedDiscoveryRoot[] = [];

  for (const root of roots) {
    const duplicateOf = activeRoots.find((activeRoot) => coversDiscoveryRoot(activeRoot, root));

    if (duplicateOf) {
      skippedRoots.push({
        root,
        duplicateOf,
        detail: describeDuplicateRoot(root, duplicateOf),
      });
      continue;
    }

    const coveredRoots = activeRoots.filter((activeRoot) => coversDiscoveryRoot(root, activeRoot));

    if (coveredRoots.length > 0) {
      activeRoots = activeRoots.filter((activeRoot) => !coveredRoots.includes(activeRoot));

      for (const coveredRoot of coveredRoots) {
        skippedRoots.push({
          root: coveredRoot,
          duplicateOf: root,
          detail: describeDuplicateRoot(coveredRoot, root),
        });
      }
    }

    activeRoots.push(root);
  }

  return {
    activeRoots,
    skippedRoots,
  };
}

function coversDiscoveryRoot(
  activeRoot: DiscoveryRootConfig,
  candidateRoot: DiscoveryRootConfig,
): boolean {
  if (activeRoot.provider !== candidateRoot.provider) {
    return false;
  }

  if (!hasEquivalentRootSemantics(activeRoot, candidateRoot)) {
    return false;
  }

  const activePath = normalizeRootPath(activeRoot.path);
  const candidatePath = normalizeRootPath(candidateRoot.path);

  if (activePath === candidatePath) {
    return true;
  }

  if (!activeRoot.recursive) {
    return false;
  }

  return candidatePath.startsWith(`${activePath}${sep}`);
}

function describeDuplicateRoot(
  root: DiscoveryRootConfig,
  duplicateOf: DiscoveryRootConfig,
): string {
  return normalizeRootPath(root.path) === normalizeRootPath(duplicateOf.path)
    ? `Root duplicates ${duplicateOf.path}`
    : `Root is already covered by recursive root ${duplicateOf.path}`;
}

function normalizeRootPath(rootPath: string): string {
  return resolve(rootPath);
}

function hasEquivalentRootSemantics(
  left: DiscoveryRootConfig,
  right: DiscoveryRootConfig,
): boolean {
  return Boolean(left.recursive) === Boolean(right.recursive)
    && Boolean(left.watch) === Boolean(right.watch)
    && haveEquivalentGlobLists(left.include, right.include)
    && haveEquivalentGlobLists(left.exclude, right.exclude)
    && stableSerializeValue(left.metadata ?? null) === stableSerializeValue(right.metadata ?? null);
}

function haveEquivalentGlobLists(
  left: string[] | undefined,
  right: string[] | undefined,
): boolean {
  return stableSerializeValue(normalizeGlobList(left))
    === stableSerializeValue(normalizeGlobList(right));
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
