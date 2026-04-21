import { resolve } from "node:path";

import type { IngestAuditScenario } from "../../test/ingest/audit-matrix.js";
import {
  fileExists,
  listRelativeFiles,
  readJsonFile,
} from "./file-system.js";
import type { LiveFixtureRefreshManifestRecord } from "./live-fixture-types.js";
import { loadRefreshManifest } from "./refresh-manifest.js";
import type {
  IngestAuditLiveFixtureSummary,
  IngestAuditLiveParityStatus,
} from "./report-contract.js";
import { normalizeLiveFixtureSidecar } from "./sidecar.js";

type UnsupportedObservedContainer = {
  expected?: {
    unsupportedObserved?: unknown;
  };
  unsupportedObserved?: unknown;
};

type ManifestBackedLiveFixtureRecord = {
  manifestPath: string;
  sidecarPath: string;
  fixturePath: string;
  record: LiveFixtureRefreshManifestRecord;
  supersededByFixturePath: string | null;
  isCurrentHead: boolean;
  lineageDepth: number;
};

type LiveFixtureSummariesByScenario = ReadonlyMap<
  string,
  readonly IngestAuditLiveFixtureSummary[]
>;

export async function loadLiveFixtureSummariesByScenario(params: {
  repoRoot: string;
  liveCaptureScenarios: ReadonlyMap<string, IngestAuditScenario>;
}): Promise<LiveFixtureSummariesByScenario> {
  const manifestRecords = await loadManifestBackedLiveFixtureRecords(
    params.repoRoot,
  );
  const sidecarPaths = await listLiveFixtureSidecars(params.repoRoot);
  await validateSidecarManifestCoverage({
    repoRoot: params.repoRoot,
    sidecarPaths,
    manifestRecords,
  });

  const summaries = await Promise.all(
    manifestRecords.map((record) =>
      loadLiveFixtureSummary(params.repoRoot, record),
    ),
  );

  validateLiveFixtureSummaries(summaries, params.liveCaptureScenarios);
  validateCurrentHeadCoverage(summaries);
  return groupLiveFixtureSummariesByScenario(summaries);
}

export function createScenarioLiveParitySummary(params: {
  scenario: IngestAuditScenario;
  liveFixtures: readonly IngestAuditLiveFixtureSummary[];
}): {
  liveParityStatus: IngestAuditLiveParityStatus;
  currentHeadFixturePaths: readonly string[];
  supersededFixturePaths: readonly string[];
} {
  return {
    liveParityStatus: getLiveParityStatus(params.scenario, params.liveFixtures),
    currentHeadFixturePaths: params.liveFixtures
      .filter((fixture) => fixture.isCurrentHead)
      .map((fixture) => fixture.fixturePath)
      .sort(),
    supersededFixturePaths: params.liveFixtures
      .filter((fixture) => !fixture.isCurrentHead)
      .map((fixture) => fixture.fixturePath)
      .sort(),
  };
}

async function loadLiveFixtureSummary(
  repoRoot: string,
  record: ManifestBackedLiveFixtureRecord,
): Promise<IngestAuditLiveFixtureSummary> {
  const absoluteSidecarPath = resolve(repoRoot, record.sidecarPath);
  const metadata = await readJsonFile<unknown>(absoluteSidecarPath);
  const normalized = normalizeLiveFixtureSidecar(metadata);

  if (normalized === null) {
    throw new Error(`Live fixture sidecar is malformed at ${record.sidecarPath}.`);
  }

  validateSidecarMatchesManifestRecord(
    record.sidecarPath,
    normalized,
    record.record,
  );

  return {
    sidecarPath: record.sidecarPath,
    manifestPath: record.manifestPath,
    fixturePath: record.fixturePath,
    scenarioId: normalized.scenarioId,
    provider: normalized.provider,
    sourceFamilies: normalized.sourceFamilies,
    captureKind: normalized.captureKind,
    capturedAt: normalized.capturedAt,
    artifactVersion: normalized.artifactVersion,
    providerVersion: normalized.providerVersion,
    sdkVersion: normalized.sdkVersion,
    sanitizerVersion: normalized.sanitizerVersion,
    sanitizedBy: normalized.sanitizedBy,
    hasProvenanceHistory: (normalized.provenanceHistory?.length ?? 0) > 0,
    provenanceHistoryLength: normalized.provenanceHistory?.length ?? 0,
    supersedesFixturePath: record.record.supersedesFixturePath,
    supersededByFixturePath: record.supersededByFixturePath,
    isCurrentHead: record.isCurrentHead,
    lineageDepth: record.lineageDepth,
    unsupportedObserved: normalizeUnsupportedObserved(
      metadata as UnsupportedObservedContainer,
    ),
  };
}

async function loadManifestBackedLiveFixtureRecords(
  repoRoot: string,
): Promise<readonly ManifestBackedLiveFixtureRecord[]> {
  const manifestPaths = await listRefreshManifestPaths(repoRoot);
  const records: ManifestBackedLiveFixtureRecord[] = [];
  const fixturePaths = new Set<string>();
  const sidecarPaths = new Set<string>();

  for (const manifestPath of manifestPaths) {
    const manifest = await loadRefreshManifest(resolve(repoRoot, manifestPath));
    const supersededByFixturePath = new Map<string, string>();

    for (const record of manifest) {
      if (record.supersedesFixturePath !== null) {
        supersededByFixturePath.set(record.supersedesFixturePath, record.fixturePath);
      }
    }

    for (const record of manifest) {
      const fixturePath = normalizeComparablePath(record.fixturePath);
      const sidecarPath = getSidecarPathFromFixturePath(fixturePath);

      if (fixturePaths.has(fixturePath)) {
        throw new Error(
          `Refresh manifests declare duplicate fixture path ${fixturePath}.`,
        );
      }

      if (sidecarPaths.has(sidecarPath)) {
        throw new Error(
          `Refresh manifests declare duplicate live fixture sidecar ${sidecarPath}.`,
        );
      }

      fixturePaths.add(fixturePath);
      sidecarPaths.add(sidecarPath);
      records.push({
        manifestPath,
        sidecarPath,
        fixturePath,
        record,
        supersededByFixturePath:
          supersededByFixturePath.get(record.fixturePath) ?? null,
        isCurrentHead: !supersededByFixturePath.has(record.fixturePath),
        lineageDepth: record.provenanceHistory.length,
      });
    }
  }

  return records.sort((left, right) =>
    left.fixturePath.localeCompare(right.fixturePath),
  );
}

async function listRefreshManifestPaths(
  repoRoot: string,
): Promise<readonly string[]> {
  return listRelativeFiles({
    rootDir: repoRoot,
    startDir: "test/fixtures",
    match(relativePath) {
      return relativePath.endsWith("/refresh-manifest.json");
    },
  });
}

async function listLiveFixtureSidecars(
  repoRoot: string,
): Promise<readonly string[]> {
  return listRelativeFiles({
    rootDir: repoRoot,
    startDir: "test/fixtures",
    match(relativePath) {
      return relativePath.endsWith(".fixture.json");
    },
  });
}

async function validateSidecarManifestCoverage(params: {
  repoRoot: string;
  sidecarPaths: readonly string[];
  manifestRecords: readonly ManifestBackedLiveFixtureRecord[];
}): Promise<void> {
  const declaredSidecars = new Set(
    params.manifestRecords.map((record) => record.sidecarPath),
  );
  const knownSidecars = new Set(params.sidecarPaths);

  for (const record of params.manifestRecords) {
    if (!knownSidecars.has(record.sidecarPath)) {
      throw new Error(
        `Refresh manifest ${record.manifestPath} references missing live fixture sidecar ${record.sidecarPath}.`,
      );
    }

    const absoluteFixturePath = resolve(params.repoRoot, record.fixturePath);
    const fixtureExists = await fileExists(absoluteFixturePath);

    if (!fixtureExists) {
      throw new Error(
        `Refresh manifest ${record.manifestPath} references missing live fixture artifact ${record.fixturePath}.`,
      );
    }
  }

  for (const sidecarPath of params.sidecarPaths) {
    if (!declaredSidecars.has(sidecarPath)) {
      throw new Error(
        `Live fixture sidecar ${sidecarPath} is not declared in any refresh manifest.`,
      );
    }
  }
}

function validateLiveFixtureSummaries(
  summaries: readonly IngestAuditLiveFixtureSummary[],
  liveCaptureScenarios: ReadonlyMap<string, IngestAuditScenario>,
): void {
  for (const summary of summaries) {
    const scenario = liveCaptureScenarios.get(summary.scenarioId);

    if (scenario === undefined) {
      throw new Error(
        `Live fixture sidecar ${summary.fixturePath} declares unknown audit scenario ${summary.scenarioId}.`,
      );
    }

    validateLiveFixtureSummary(summary, scenario);
  }
}

function validateLiveFixtureSummary(
  summary: IngestAuditLiveFixtureSummary,
  scenario: IngestAuditScenario,
): void {
  const expectedProvider = getScenarioProvider(scenario);
  const allowedSourceFamilies = new Set<string>(scenario.sourceFamilies);

  if (summary.provider !== expectedProvider) {
    throw new Error(
      `Live fixture sidecar ${summary.fixturePath} declares provider ${summary.provider}, expected ${expectedProvider} for ${scenario.id}.`,
    );
  }

  const invalidSourceFamily = summary.sourceFamilies.find(
    (sourceFamily) => !allowedSourceFamilies.has(sourceFamily),
  );

  if (invalidSourceFamily !== undefined) {
    throw new Error(
      `Live fixture sidecar ${summary.sidecarPath} declares unsupported source family ${invalidSourceFamily} for ${scenario.id}.`,
    );
  }
}

function validateCurrentHeadCoverage(
  summaries: readonly IngestAuditLiveFixtureSummary[],
): void {
  const currentHeadCoverage = new Map<string, IngestAuditLiveFixtureSummary>();

  for (const summary of summaries) {
    if (!summary.isCurrentHead) {
      continue;
    }

    for (const sourceFamily of summary.sourceFamilies) {
      const coverageKey = `${summary.scenarioId}:${sourceFamily}`;
      const existing = currentHeadCoverage.get(coverageKey);

      if (existing !== undefined) {
        throw new Error(
          `Live fixture ${summary.fixturePath} declares duplicate current-head coverage for ${coverageKey}; already covered by ${existing.fixturePath}.`,
        );
      }

      currentHeadCoverage.set(coverageKey, summary);
    }
  }
}

function validateSidecarMatchesManifestRecord(
  sidecarPath: string,
  sidecar: ReturnType<typeof normalizeLiveFixtureSidecar>,
  record: LiveFixtureRefreshManifestRecord,
): void {
  if (sidecar === null) {
    return;
  }

  if (
    sidecar.scenarioId !== record.scenarioId ||
    sidecar.provider !== record.provider ||
    sidecar.captureKind !== record.captureKind ||
    sidecar.capturedAt !== record.capturedAt ||
    sidecar.artifactVersion !== record.artifactVersion ||
    sidecar.providerVersion !== record.providerVersion ||
    sidecar.sdkVersion !== record.sdkVersion ||
    sidecar.sanitizerVersion !== record.sanitizerVersion ||
    sidecar.sanitizedBy !== record.sanitizedBy ||
    !hasSameSourceFamilies(sidecar.sourceFamilies, record.sourceFamilies)
  ) {
    throw new Error(
      `Live fixture sidecar ${sidecarPath} does not match its refresh manifest record.`,
    );
  }
}

function normalizeUnsupportedObserved(
  metadata: UnsupportedObservedContainer,
): readonly string[] {
  const topLevel = normalizeStringList(metadata.unsupportedObserved);

  if (topLevel.length > 0) {
    return topLevel;
  }

  return normalizeStringList(metadata.expected?.unsupportedObserved);
}

function normalizeStringList(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function getSidecarPathFromFixturePath(fixturePath: string): string {
  const extensionMatch = fixturePath.match(/\.[^./]+$/u);

  if (!extensionMatch) {
    throw new Error(`Fixture path ${fixturePath} does not have an extension.`);
  }

  return `${fixturePath.slice(0, -extensionMatch[0].length)}.fixture.json`;
}

function getLiveParityStatus(
  scenario: IngestAuditScenario,
  liveFixtures: readonly IngestAuditLiveFixtureSummary[],
): IngestAuditLiveParityStatus {
  if (scenario.probeKind !== "live-capture") {
    return "not-applicable";
  }

  if (liveFixtures.length === 0) {
    return "missing-fixtures";
  }

  const currentHeads = liveFixtures.filter((fixture) => fixture.isCurrentHead);

  if (currentHeads.length === 0) {
    return "partial";
  }

  const coveredFamilies = new Set(
    currentHeads.flatMap((fixture) => fixture.sourceFamilies),
  );

  return scenario.sourceFamilies.every((family) => coveredFamilies.has(family))
    ? "ready"
    : "partial";
}

function groupLiveFixtureSummariesByScenario(
  summaries: readonly IngestAuditLiveFixtureSummary[],
): LiveFixtureSummariesByScenario {
  const grouped = new Map<string, IngestAuditLiveFixtureSummary[]>();

  for (const summary of summaries) {
    const scenarioSummaries = grouped.get(summary.scenarioId);

    if (scenarioSummaries === undefined) {
      grouped.set(summary.scenarioId, [summary]);
      continue;
    }

    scenarioSummaries.push(summary);
  }

  for (const scenarioSummaries of grouped.values()) {
    scenarioSummaries.sort((left, right) => {
      if (left.isCurrentHead !== right.isCurrentHead) {
        return left.isCurrentHead ? -1 : 1;
      }

      return left.fixturePath.localeCompare(right.fixturePath);
    });
  }

  return grouped;
}

function normalizeComparablePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.?\//u, "");
}

function getScenarioProvider(scenario: IngestAuditScenario): string {
  const providerPrefixes = new Set(
    scenario.sourceFamilies.map((sourceFamily) => getSourceFamilyProvider(sourceFamily)),
  );

  if (providerPrefixes.size !== 1) {
    throw new Error(
      `Audit matrix scenario ${scenario.id} does not resolve to a single provider namespace.`,
    );
  }

  const [provider] = providerPrefixes;

  if (provider === undefined) {
    throw new Error(
      `Audit matrix scenario ${scenario.id} does not declare any source families.`,
    );
  }

  return provider;
}

function getSourceFamilyProvider(sourceFamily: string): string {
  return sourceFamily.split("-", 1)[0] ?? sourceFamily;
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
