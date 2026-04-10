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
      continue;
    }

    const priorRecord = recordsByPath.get(record.supersedesFixturePath);

    if (priorRecord === undefined) {
      continue;
    }

    if (
      priorRecord.scenarioId !== record.scenarioId ||
      priorRecord.provider !== record.provider ||
      !hasSameSourceFamilies(priorRecord.sourceFamilies, record.sourceFamilies)
    ) {
      return false;
    }
  }

  return true;
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
