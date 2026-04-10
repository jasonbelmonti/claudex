import {
  type LiveFixtureRefreshManifest,
  type LiveFixtureRefreshManifestRecord,
  isRecord,
  normalizeLiveFixtureMetadata,
  readNullableStringField,
  readStringField,
} from "./live-fixture-types";

export async function loadRefreshManifest(
  manifestPath: string,
): Promise<LiveFixtureRefreshManifest> {
  let raw: unknown;

  try {
    raw = await Bun.file(manifestPath).json();
  } catch (cause) {
    throw new Error(`Failed to read refresh manifest at ${manifestPath}.`, {
      cause,
    });
  }

  const manifest = normalizeRefreshManifest(raw);

  if (manifest === null) {
    throw new Error(`Refresh manifest at ${manifestPath} is malformed.`);
  }

  return manifest;
}

export function normalizeRefreshManifest(
  value: unknown,
): LiveFixtureRefreshManifest | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const manifest: LiveFixtureRefreshManifestRecord[] = [];

  for (const entry of value) {
    const normalized = normalizeRefreshManifestRecord(entry);

    if (normalized === null) {
      return null;
    }

    manifest.push(normalized);
  }

  if (!hasConsistentSupersessionGraph(manifest)) {
    return null;
  }

  return manifest;
}

export function normalizeRefreshManifestRecord<
  TExtra extends Record<string, unknown> = Record<string, unknown>,
>(
  value: unknown,
): LiveFixtureRefreshManifestRecord<TExtra> | null {
  const metadata = normalizeLiveFixtureMetadata(value, {
    requireProvenanceHistory: true,
  });

  if (metadata === null || !isRecord(value)) {
    return null;
  }

  const fixturePath = readStringField(value, "fixturePath");
  const supersedesFixturePath = readNullableStringField(
    value,
    "supersedesFixturePath",
  );

  if (fixturePath === null || supersedesFixturePath === undefined) {
    return null;
  }

  if (supersedesFixturePath === null && metadata.provenanceHistory?.length !== 0) {
    return null;
  }

  if (supersedesFixturePath !== null && metadata.provenanceHistory?.length === 0) {
    return null;
  }

  return {
    ...value,
    ...metadata,
    fixturePath,
    supersedesFixturePath,
    provenanceHistory: metadata.provenanceHistory ?? [],
  } as LiveFixtureRefreshManifestRecord<TExtra>;
}

function hasConsistentSupersessionGraph(
  manifest: readonly LiveFixtureRefreshManifestRecord[],
): boolean {
  const recordsByPath = new Map<string, LiveFixtureRefreshManifestRecord>();
  const supersessionTargets = new Set<string>();
  const rootLineages = new Set<string>();

  for (const record of manifest) {
    if (
      record.fixturePath === record.supersedesFixturePath ||
      recordsByPath.has(record.fixturePath)
    ) {
      return false;
    }

    recordsByPath.set(record.fixturePath, record);
  }

  for (const record of manifest) {
    if (record.supersedesFixturePath === null) {
      const rootLineageKey = createLineageKey(record);

      if (rootLineages.has(rootLineageKey)) {
        return false;
      }

      rootLineages.add(rootLineageKey);
      continue;
    }

    if (supersessionTargets.has(record.supersedesFixturePath)) {
      return false;
    }

    supersessionTargets.add(record.supersedesFixturePath);

    const priorRecord = recordsByPath.get(record.supersedesFixturePath);

    if (priorRecord === undefined) {
      continue;
    }

    if (
      priorRecord.scenarioId !== record.scenarioId ||
      priorRecord.provider !== record.provider ||
      !hasSameSourceFamilies(priorRecord.sourceFamilies, record.sourceFamilies) ||
      !hasMatchingPriorProvenance(record, priorRecord)
    ) {
      return false;
    }
  }

  if (hasSupersessionCycle(recordsByPath)) {
    return false;
  }

  return true;
}

function createLineageKey(record: LiveFixtureRefreshManifestRecord): string {
  return JSON.stringify({
    scenarioId: record.scenarioId,
    provider: record.provider,
    sourceFamilies: [...record.sourceFamilies].sort(),
  });
}

function hasSupersessionCycle(
  recordsByPath: ReadonlyMap<string, LiveFixtureRefreshManifestRecord>,
): boolean {
  const visited = new Set<string>();
  const visiting = new Set<string>();

  for (const fixturePath of recordsByPath.keys()) {
    if (detectCycle(fixturePath, recordsByPath, visited, visiting)) {
      return true;
    }
  }

  return false;
}

function detectCycle(
  fixturePath: string,
  recordsByPath: ReadonlyMap<string, LiveFixtureRefreshManifestRecord>,
  visited: Set<string>,
  visiting: Set<string>,
): boolean {
  if (visited.has(fixturePath)) {
    return false;
  }

  if (visiting.has(fixturePath)) {
    return true;
  }

  visiting.add(fixturePath);

  const record = recordsByPath.get(fixturePath);
  const priorFixturePath = record?.supersedesFixturePath;

  if (
    priorFixturePath !== null &&
    priorFixturePath !== undefined &&
    detectCycle(priorFixturePath, recordsByPath, visited, visiting)
  ) {
    return true;
  }

  visiting.delete(fixturePath);
  visited.add(fixturePath);
  return false;
}

function hasSameSourceFamilies(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftFamilies = [...left].sort();
  const rightFamilies = [...right].sort();

  return leftFamilies.every(
    (sourceFamily, index) => sourceFamily === rightFamilies[index],
  );
}

function hasMatchingPriorProvenance(
  record: LiveFixtureRefreshManifestRecord,
  priorRecord: LiveFixtureRefreshManifestRecord,
): boolean {
  const expectedHistory = [
    ...priorRecord.provenanceHistory,
    toProvenanceEntry(priorRecord),
  ];

  if (record.provenanceHistory.length !== expectedHistory.length) {
    return false;
  }

  return record.provenanceHistory.every(
    (entry, index) => hasSameProvenanceEntry(entry, expectedHistory[index]),
  );
}

function toProvenanceEntry(
  record: LiveFixtureRefreshManifestRecord,
): LiveFixtureRefreshManifestRecord["provenanceHistory"][number] {
  return {
    capturedAt: record.capturedAt,
    artifactVersion: record.artifactVersion,
    providerVersion: record.providerVersion,
    sdkVersion: record.sdkVersion,
    sanitizerVersion: record.sanitizerVersion,
    sanitizedBy: record.sanitizedBy,
  };
}

function hasSameProvenanceEntry(
  left: LiveFixtureRefreshManifestRecord["provenanceHistory"][number],
  right: LiveFixtureRefreshManifestRecord["provenanceHistory"][number] | undefined,
): boolean {
  return (
    right !== undefined &&
    left.capturedAt === right.capturedAt &&
    left.artifactVersion === right.artifactVersion &&
    left.providerVersion === right.providerVersion &&
    left.sdkVersion === right.sdkVersion &&
    left.sanitizerVersion === right.sanitizerVersion &&
    left.sanitizedBy === right.sanitizedBy
  );
}
