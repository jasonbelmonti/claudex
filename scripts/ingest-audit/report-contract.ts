import {
  INGEST_AUDIT_SCENARIOS,
  type IngestAuditBaselineStatus,
  type IngestAuditProbeKind,
  type IngestAuditScenario,
  type IngestAuditSourceFamily,
} from "../../test/ingest/audit-matrix.js";
import {
  createScenarioLiveParitySummary,
  loadLiveFixtureSummariesByScenario,
} from "./live-fixture-report.js";

export const INGEST_AUDIT_REPORT_SCHEMA_VERSION = "ingest-audit-report.v1";

export type IngestAuditCommandStatus = "passed" | "failed";

export type IngestAuditCoverageSummary = {
  lines: {
    covered: number;
    found: number;
    pct: number;
  };
  functions: {
    covered: number;
    found: number;
    pct: number;
  };
};

export type IngestAuditCommandResult = {
  id: string;
  label: string;
  command: readonly string[];
  status: IngestAuditCommandStatus;
  exitCode: number;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  reporterPath?: string;
};

export type IngestAuditLiveFixtureSummary = {
  sidecarPath: string;
  manifestPath: string;
  fixturePath: string;
  scenarioId: string;
  provider: string;
  sourceFamilies: readonly string[];
  captureKind: string;
  capturedAt: string;
  artifactVersion: string;
  providerVersion: string;
  sdkVersion: string;
  sanitizerVersion: string;
  sanitizedBy: string;
  hasProvenanceHistory: boolean;
  provenanceHistoryLength: number;
  supersedesFixturePath: string | null;
  supersededByFixturePath: string | null;
  isCurrentHead: boolean;
  lineageDepth: number;
  unsupportedObserved: readonly string[];
};

export type IngestAuditLiveParityStatus =
  | "not-applicable"
  | "missing-fixtures"
  | "partial"
  | "ready";

export type IngestAuditScenarioSummary = {
  scenarioId: string;
  title: string;
  probeKind: IngestAuditProbeKind;
  baselineStatus: IngestAuditBaselineStatus;
  sourceFamilies: readonly IngestAuditSourceFamily[];
  dimensions: readonly string[];
  existingCoverage: readonly string[];
  defaultRunInclusion: "executed" | "not-executed";
  liveParityStatus: IngestAuditLiveParityStatus;
  currentHeadFixturePaths: readonly string[];
  supersededFixturePaths: readonly string[];
  liveFixtures: readonly IngestAuditLiveFixtureSummary[];
  notes?: string;
};

export type IngestAuditFindingCategory =
  | "confirmed-regression"
  | "unsupported-but-observed"
  | "intentionally-unasserted";

export type IngestAuditFinding = {
  category: IngestAuditFindingCategory;
  summary: string;
  scenarioIds: readonly string[];
  coveragePaths: readonly string[];
  details: readonly string[];
  commandIds?: readonly string[];
};

export type IngestAuditReport = {
  schemaVersion: typeof INGEST_AUDIT_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  mode: "deterministic";
  entrypoint: {
    script: "audit:ingest";
    jsonPath: string;
    textPath: string;
  };
  repository: {
    root: string;
    packageName: string;
    packageVersion: string;
    git: {
      branch: string | null;
      commitSha: string | null;
      dirty: boolean;
    };
  };
  runtime: {
    bunVersion: string;
    packageManager: string | null;
  };
  dependencies: {
    claudeAgentSdk: string | null;
    codexSdk: string | null;
  };
  summary: {
    status: "passed" | "failed";
    deterministicScenarioCount: number;
    liveScenarioCount: number;
    liveReadyScenarioCount: number;
    livePartialScenarioCount: number;
    confirmedRegressionCount: number;
    unsupportedObservedCount: number;
    intentionallyUnassertedCount: number;
  };
  commands: readonly IngestAuditCommandResult[];
  coverage: IngestAuditCoverageSummary | null;
  scenarios: readonly IngestAuditScenarioSummary[];
  findings: {
    confirmedRegressions: readonly IngestAuditFinding[];
    unsupportedButObserved: readonly IngestAuditFinding[];
    intentionallyUnasserted: readonly IngestAuditFinding[];
  };
};

export async function createScenarioSummaries(
  repoRoot: string,
): Promise<readonly IngestAuditScenarioSummary[]> {
  const liveCaptureScenarios = createLiveCaptureScenarioMap();
  const liveFixturesByScenario = await loadLiveFixtureSummariesByScenario({
    repoRoot,
    liveCaptureScenarios,
  });

  return INGEST_AUDIT_SCENARIOS.map((scenario) => {
    const liveFixtures = liveFixturesByScenario.get(scenario.id) ?? [];

    return {
      scenarioId: scenario.id,
      title: scenario.title,
      probeKind: scenario.probeKind,
      baselineStatus: scenario.baselineStatus,
      sourceFamilies: scenario.sourceFamilies,
      dimensions: scenario.dimensions,
      existingCoverage: scenario.existingCoverage,
      defaultRunInclusion:
        scenario.probeKind === "deterministic-fixture"
          ? "executed"
          : "not-executed",
      ...createScenarioLiveParitySummary({
        scenario,
        liveFixtures,
      }),
      liveFixtures,
      notes: readScenarioNotes(scenario),
    };
  });
}

export function mapCoverageFilesToScenarioIds(
  filePaths: readonly string[],
): readonly string[] {
  const scenarioIds = new Set<string>();

  for (const filePath of filePaths) {
    const normalizedFilePath = normalizeComparablePath(filePath);

    for (const scenario of INGEST_AUDIT_SCENARIOS) {
      const matches = scenario.existingCoverage.some((coveragePath) =>
        matchesPath(coveragePath, normalizedFilePath),
      );

      if (matches) {
        scenarioIds.add(scenario.id);
      }
    }
  }

  return [...scenarioIds].sort();
}

export function createConfirmedRegressionFindings(params: {
  failedCoverageFiles: readonly string[];
  failedCommandIds: readonly string[];
}): readonly IngestAuditFinding[] {
  if (
    params.failedCoverageFiles.length === 0 &&
    params.failedCommandIds.length === 0
  ) {
    return [];
  }

  const scenarioIds = mapCoverageFilesToScenarioIds(params.failedCoverageFiles);
  const scenarioDetails = scenarioIds
    .map((scenarioId) => getScenarioById(scenarioId))
    .filter((scenario) => scenario !== null);
  const coveragePaths = [
    ...new Set(
      scenarioDetails.flatMap((scenario) => scenario.existingCoverage),
    ),
  ];
  const details = [
    ...params.failedCoverageFiles.map(
      (filePath) => `Failed coverage file: ${filePath}`,
    ),
    ...scenarioDetails.map(
      (scenario) => `Mapped scenario: ${scenario.id} (${scenario.title})`,
    ),
  ];

  return [
    {
      category: "confirmed-regression",
      summary:
        scenarioIds.length === 0
          ? "Deterministic audit commands failed before a matrix scenario could be mapped."
          : "Deterministic audit command failures mapped back to named audit-matrix scenarios.",
      scenarioIds,
      coveragePaths:
        coveragePaths.length === 0
          ? params.failedCoverageFiles
          : coveragePaths,
      details,
      commandIds: params.failedCommandIds,
    },
  ];
}

export function createUnsupportedObservedFindings(
  scenarios: readonly IngestAuditScenarioSummary[],
): readonly IngestAuditFinding[] {
  return scenarios
    .flatMap((scenario) =>
      scenario.liveFixtures.flatMap((fixture) =>
        fixture.isCurrentHead
          ? fixture.unsupportedObserved.map((item) => ({
              category: "unsupported-but-observed" as const,
              summary: `${scenario.scenarioId} documents an unsupported-but-observed artifact.`,
              scenarioIds: [scenario.scenarioId],
              coveragePaths: [fixture.fixturePath],
              details: [
                `Observed unsupported artifact: ${item}`,
                `Fixture provenance: ${fixture.providerVersion} / ${fixture.artifactVersion}`,
              ],
            }))
          : [],
      ),
    )
    .sort((left, right) => left.summary.localeCompare(right.summary));
}

export function createIntentionallyUnassertedFindings(
  scenarios: readonly IngestAuditScenarioSummary[],
): readonly IngestAuditFinding[] {
  return scenarios
    .filter((scenario) => shouldSurfaceAsUnasserted(scenario))
    .map((scenario) => ({
      category: "intentionally-unasserted" as const,
      summary: `${scenario.scenarioId} remains intentionally unasserted in the default deterministic harness.`,
      scenarioIds: [scenario.scenarioId],
      coveragePaths: scenario.existingCoverage,
      details: createUnassertedDetails(scenario),
    }))
    .sort((left, right) => left.summary.localeCompare(right.summary));
}

export function createAuditReport(params: {
  repoRoot: string;
  generatedAt: string;
  jsonPath: string;
  textPath: string;
  repository: IngestAuditReport["repository"];
  runtime: IngestAuditReport["runtime"];
  dependencies: IngestAuditReport["dependencies"];
  commands: readonly IngestAuditCommandResult[];
  coverage: IngestAuditCoverageSummary | null;
  scenarios: readonly IngestAuditScenarioSummary[];
  confirmedRegressions: readonly IngestAuditFinding[];
  unsupportedButObserved: readonly IngestAuditFinding[];
  intentionallyUnasserted: readonly IngestAuditFinding[];
}): IngestAuditReport {
  const deterministicScenarioCount = params.scenarios.filter(
    (scenario) => scenario.probeKind === "deterministic-fixture",
  ).length;
  const liveScenarioCount =
    params.scenarios.length - deterministicScenarioCount;
  const liveReadyScenarioCount = params.scenarios.filter(
    (scenario) => scenario.liveParityStatus === "ready",
  ).length;
  const livePartialScenarioCount = params.scenarios.filter(
    (scenario) =>
      scenario.liveParityStatus === "missing-fixtures" ||
      scenario.liveParityStatus === "partial",
  ).length;
  const status = params.commands.every(
    (command) => command.status === "passed",
  )
    ? "passed"
    : "failed";

  return {
    schemaVersion: INGEST_AUDIT_REPORT_SCHEMA_VERSION,
    generatedAt: params.generatedAt,
    mode: "deterministic",
    entrypoint: {
      script: "audit:ingest",
      jsonPath: params.jsonPath,
      textPath: params.textPath,
    },
    repository: params.repository,
    runtime: params.runtime,
    dependencies: params.dependencies,
    summary: {
      status,
      deterministicScenarioCount,
      liveScenarioCount,
      liveReadyScenarioCount,
      livePartialScenarioCount,
      confirmedRegressionCount: params.confirmedRegressions.length,
      unsupportedObservedCount: params.unsupportedButObserved.length,
      intentionallyUnassertedCount: params.intentionallyUnasserted.length,
    },
    commands: params.commands,
    coverage: params.coverage,
    scenarios: params.scenarios,
    findings: {
      confirmedRegressions: params.confirmedRegressions,
      unsupportedButObserved: params.unsupportedButObserved,
      intentionallyUnasserted: params.intentionallyUnasserted,
    },
  };
}

function shouldSurfaceAsUnasserted(
  scenario: IngestAuditScenarioSummary,
): boolean {
  return (
    scenario.probeKind === "live-capture" ||
    scenario.baselineStatus === "partial" ||
    scenario.baselineStatus === "planned"
  );
}

function createUnassertedDetails(
  scenario: IngestAuditScenarioSummary,
): readonly string[] {
  const details = [
    `Baseline status: ${scenario.baselineStatus}`,
    scenario.defaultRunInclusion === "not-executed"
      ? "Default deterministic run does not execute this scenario."
      : "Default deterministic run executes some coverage for this scenario, but the matrix still marks it incomplete.",
  ];

  if (scenario.notes) {
    details.push(`Notes: ${scenario.notes}`);
  }

  if (scenario.probeKind === "live-capture") {
    details.push(`Live parity status: ${scenario.liveParityStatus}`);
    details.push(
      scenario.currentHeadFixturePaths.length === 0
        ? "Current live fixture heads: none"
        : `Current live fixture heads: ${scenario.currentHeadFixturePaths.join(", ")}`,
    );
    details.push(
      scenario.supersededFixturePaths.length === 0
        ? "Superseded live fixtures: none"
        : `Superseded live fixtures: ${scenario.supersededFixturePaths.join(", ")}`,
    );
  }

  return details;
}

function getScenarioById(scenarioId: string): IngestAuditScenario | null {
  return (
    INGEST_AUDIT_SCENARIOS.find((scenario) => scenario.id === scenarioId) ??
    null
  );
}

function matchesPath(expectedPath: string, actualPath: string): boolean {
  const normalizedExpected = normalizeComparablePath(expectedPath);

  return (
    actualPath === normalizedExpected ||
    actualPath.endsWith(`/${normalizedExpected}`) ||
    normalizedExpected.endsWith(`/${actualPath}`)
  );
}

function normalizeComparablePath(filePath: string): string {
  return filePath.replaceAll("\\", "/").replace(/^\.?\//u, "");
}

function createLiveCaptureScenarioMap(): ReadonlyMap<string, IngestAuditScenario> {
  const liveCaptureScenarios = new Map<string, IngestAuditScenario>();

  for (const scenario of INGEST_AUDIT_SCENARIOS) {
    if (scenario.probeKind !== "live-capture") {
      continue;
    }

    liveCaptureScenarios.set(scenario.id, scenario);
  }

  return liveCaptureScenarios;
}

function readScenarioNotes(scenario: IngestAuditScenario): string | undefined {
  return "notes" in scenario ? scenario.notes : undefined;
}
