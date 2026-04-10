export const LIVE_FIXTURE_PROVENANCE_FIELDS = [
  "capturedAt",
  "artifactVersion",
  "providerVersion",
  "sdkVersion",
  "sanitizerVersion",
  "sanitizedBy",
] as const;

export type LiveFixtureProvenanceField =
  (typeof LIVE_FIXTURE_PROVENANCE_FIELDS)[number];

export type LiveFixtureProvenanceEntry = {
  capturedAt: string;
  artifactVersion: string;
  providerVersion: string;
  sdkVersion: string;
  sanitizerVersion: string;
  sanitizedBy: string;
};

export type LiveFixtureProvenanceHistory =
  readonly LiveFixtureProvenanceEntry[];

export const LIVE_FIXTURE_SIDECAR_REQUIRED_FIELDS = [
  "scenarioId",
  "provider",
  "sourceFamilies",
  "captureKind",
  ...LIVE_FIXTURE_PROVENANCE_FIELDS,
] as const;

export const LIVE_FIXTURE_REFRESH_MANIFEST_REQUIRED_FIELDS = [
  ...LIVE_FIXTURE_SIDECAR_REQUIRED_FIELDS,
  "fixturePath",
  "supersedesFixturePath",
  "provenanceHistory",
] as const;

export type LiveFixtureSidecarCore = {
  scenarioId: string;
  provider: string;
  sourceFamilies: readonly string[];
  captureKind: string;
} & LiveFixtureProvenanceEntry;

export type LiveFixtureSidecar<TExtra extends Record<string, unknown> = Record<string, unknown>> =
  LiveFixtureSidecarCore &
    TExtra & {
      provenanceHistory?: LiveFixtureProvenanceHistory;
    };

export type LiveFixtureRefreshManifestRecord<
  TExtra extends Record<string, unknown> = Record<string, unknown>,
> = LiveFixtureSidecarCore &
  TExtra & {
    fixturePath: string;
    supersedesFixturePath: string | null;
    provenanceHistory: LiveFixtureProvenanceHistory;
  };

export type LiveFixtureRefreshManifest<
  TExtra extends Record<string, unknown> = Record<string, unknown>,
> = readonly LiveFixtureRefreshManifestRecord<TExtra>[];

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export function normalizeStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  if (!value.every(isNonEmptyString)) {
    return null;
  }

  return value.slice();
}

export function readStringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return isNonEmptyString(value) ? value : null;
}

export function readNullableStringField(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined {
  const value = record[key];

  if (value === null) {
    return null;
  }

  return isNonEmptyString(value) ? value : undefined;
}
export function normalizeProvenanceEntry(
  value: unknown,
): LiveFixtureProvenanceEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const capturedAt = readStringField(value, "capturedAt");
  const artifactVersion = readStringField(value, "artifactVersion");
  const providerVersion = readStringField(value, "providerVersion");
  const sdkVersion = readStringField(value, "sdkVersion");
  const sanitizerVersion = readStringField(value, "sanitizerVersion");
  const sanitizedBy = readStringField(value, "sanitizedBy");

  if (
    capturedAt === null ||
    artifactVersion === null ||
    providerVersion === null ||
    sdkVersion === null ||
    sanitizerVersion === null ||
    sanitizedBy === null
  ) {
    return null;
  }

  return {
    capturedAt,
    artifactVersion,
    providerVersion,
    sdkVersion,
    sanitizerVersion,
    sanitizedBy,
  };
}

export function normalizeProvenanceHistory(
  value: unknown,
): LiveFixtureProvenanceHistory | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const history: LiveFixtureProvenanceEntry[] = [];

  for (const entry of value) {
    const normalized = normalizeProvenanceEntry(entry);

    if (normalized === null) {
      return null;
    }

    history.push(normalized);
  }

  return history;
}

export function normalizeLiveFixtureMetadata(
  value: unknown,
  options?: { requireProvenanceHistory?: boolean },
): (LiveFixtureSidecarCore & {
  provenanceHistory?: LiveFixtureProvenanceHistory;
}) | null {
  if (!isRecord(value)) {
    return null;
  }

  const scenarioId = readStringField(value, "scenarioId");
  const provider = readStringField(value, "provider");
  const sourceFamilies = normalizeStringArray(value.sourceFamilies);
  const capturedAt = readStringField(value, "capturedAt");
  const captureKind = readStringField(value, "captureKind");
  const artifactVersion = readStringField(value, "artifactVersion");
  const providerVersion = readStringField(value, "providerVersion");
  const sdkVersion = readStringField(value, "sdkVersion");
  const sanitizerVersion = readStringField(value, "sanitizerVersion");
  const sanitizedBy = readStringField(value, "sanitizedBy");

  const requiresHistory = options?.requireProvenanceHistory === true;
  const rawHistory = value.provenanceHistory;
  const hasHistory = rawHistory !== undefined;
  const normalizedHistory = hasHistory
    ? normalizeProvenanceHistory(rawHistory)
    : undefined;

  if (
    scenarioId === null ||
    provider === null ||
    sourceFamilies === null ||
    capturedAt === null ||
    captureKind === null ||
    artifactVersion === null ||
    providerVersion === null ||
    sdkVersion === null ||
    sanitizerVersion === null ||
    sanitizedBy === null ||
    (requiresHistory && !hasHistory) ||
    (hasHistory && normalizedHistory === null)
  ) {
    return null;
  }

  const normalized: LiveFixtureSidecarCore & {
    provenanceHistory?: LiveFixtureProvenanceHistory;
  } = {
    ...value,
    scenarioId,
    provider,
    sourceFamilies,
    capturedAt,
    captureKind,
    artifactVersion,
    providerVersion,
    sdkVersion,
    sanitizerVersion,
    sanitizedBy,
  };

  if (normalizedHistory != null) {
    normalized.provenanceHistory = normalizedHistory;
  }

  return normalized;
}
