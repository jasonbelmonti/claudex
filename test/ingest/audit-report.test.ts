import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { prepareAuditOutputDir } from "../../scripts/ingest-audit/output-dir";
import {
  buildAuditReport,
  parseCoverageSummary,
  parseFailedFilesFromJunit,
  renderTextReport,
} from "../../scripts/ingest-audit/report-generator";
import {
  createConfirmedRegressionFindings,
  createIntentionallyUnassertedFindings,
  createScenarioSummaries,
  createUnsupportedObservedFindings,
} from "../../scripts/ingest-audit/report-contract";

const REPO_ROOT = new URL("../..", import.meta.url).pathname;

test("junit parsing maps failing test suites back to coverage files", () => {
  const junit = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites tests="2" failures="1">
  <testsuite name="test/ingest/runtime.test.ts" tests="1" failures="1">
    <testcase classname="test/ingest/runtime.test.ts" name="scanNow emits parse-failed warnings">
      <failure message="Expected [] to equal ['parse-failed']">boom</failure>
    </testcase>
  </testsuite>
  <testsuite name="test/ingest/codex-normalize.test.ts" tests="1" failures="0">
    <testcase classname="test/ingest/codex-normalize.test.ts" name="passes" />
  </testsuite>
</testsuites>`;

  expect(parseFailedFilesFromJunit(junit)).toEqual(["test/ingest/runtime.test.ts"]);
});

test("confirmed regression findings map failed coverage files back to matrix scenario ids", () => {
  const findings = createConfirmedRegressionFindings({
    failedCoverageFiles: ["test/ingest/runtime.test.ts"],
    failedCommandIds: ["deterministic-tests"],
  });

  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject({
    category: "confirmed-regression",
    scenarioIds: [
      "codex-session-index-bootstrap",
      "shared-runtime-adversarial-timelines",
      "shared-runtime-scan-reconcile-cursor",
    ],
    commandIds: ["deterministic-tests"],
  });
});

test("scenario summaries surface live provenance and intentionally unasserted rows", async () => {
  const scenarios = await createScenarioSummaries(REPO_ROOT);
  const intentionallyUnasserted = createIntentionallyUnassertedFindings(scenarios);
  const unsupportedButObserved = createUnsupportedObservedFindings(scenarios);
  const liveCodexScenario = scenarios.find(
    (scenario) => scenario.scenarioId === "live-codex-replay-parity",
  );

  expect(liveCodexScenario).toMatchObject({
    defaultRunInclusion: "not-executed",
    liveFixtures: [
      {
        fixturePath: "test/fixtures/codex/live-transcript-excerpt.fixture.json",
        providerVersion: "Codex Desktop 0.103.0",
      },
    ],
  });
  expect(
    intentionallyUnasserted.map((finding) => finding.scenarioIds[0]),
  ).toContain("live-codex-replay-parity");
  expect(
    intentionallyUnasserted.map((finding) => finding.scenarioIds[0]),
  ).toContain("shared-runtime-adversarial-timelines");
  expect(unsupportedButObserved).toEqual([]);
});

test("scenario summaries reject live sidecars with unknown audit scenario ids", async () => {
  const repoRoot = createTempRepoRoot();

  try {
    writeLiveFixtureSidecar(
      repoRoot,
      "test/fixtures/codex/unknown-scenario.fixture.json",
      {
        scenarioId: "live-codex-replay-parity-typo",
        provider: "codex",
        sourceFamilies: ["codex-transcript"],
      },
    );

    await expect(createScenarioSummaries(repoRoot)).rejects.toThrow(
      "unknown audit scenario",
    );
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("scenario summaries reject live sidecars with provider or source-family drift", async () => {
  const repoRoot = createTempRepoRoot();

  try {
    writeLiveFixtureSidecar(
      repoRoot,
      "test/fixtures/codex/provider-drift.fixture.json",
      {
        scenarioId: "live-codex-replay-parity",
        provider: "claude",
        sourceFamilies: ["claude-transcript"],
      },
    );

    await expect(createScenarioSummaries(repoRoot)).rejects.toThrow(
      "declares provider",
    );
  } finally {
    rmSync(repoRoot, { force: true, recursive: true });
  }
});

test("prepareAuditOutputDir removes stale audit artifacts before a new run", () => {
  const outputDir = join(
    tmpdir(),
    `claudex-ingest-audit-output-${crypto.randomUUID()}`,
  );
  const coverageDir = join(outputDir, "coverage");
  const staleJunitPath = join(outputDir, "deterministic.junit.xml");
  const staleCoveragePath = join(coverageDir, "lcov.info");

  mkdirSync(coverageDir, { recursive: true });
  writeFileSync(staleJunitPath, "stale junit");
  writeFileSync(staleCoveragePath, "stale coverage");

  prepareAuditOutputDir(outputDir, coverageDir);

  expect(existsSync(outputDir)).toBeTrue();
  expect(existsSync(coverageDir)).toBeTrue();
  expect(existsSync(staleJunitPath)).toBeFalse();
  expect(existsSync(staleCoveragePath)).toBeFalse();

  rmSync(outputDir, { force: true, recursive: true });
});

test("coverage parser aggregates lcov totals", async () => {
  const coveragePath = join(
    tmpdir(),
    `claudex-ingest-audit-${crypto.randomUUID()}.lcov`,
  );

  await Bun.write(
    coveragePath,
    ["TN:", "SF:src/example.ts", "FNF:4", "FNH:3", "LF:10", "LH:9"].join("\n"),
  );

  const summary = parseCoverageSummary(coveragePath);
  expect(summary).toEqual({
    lines: {
      covered: 9,
      found: 10,
      pct: 90,
    },
    functions: {
      covered: 3,
      found: 4,
      pct: 75,
    },
  });

  rmSync(coveragePath, { force: true });
});

test("text report renders the finding buckets and artifact paths", async () => {
  const scenarios = await createScenarioSummaries(REPO_ROOT);
  const report = buildAuditReport({
    generatedAt: "2026-04-11T12:00:00.000Z",
    jsonPath: "/tmp/report.json",
    textPath: "/tmp/report.txt",
    repository: {
      root: REPO_ROOT,
      packageName: "@jasonbelmonti/claudex",
      packageVersion: "1.0.1",
      git: {
        branch: "codex/bel-634",
        commitSha: "423d602",
        dirty: false,
      },
    },
    runtime: {
      bunVersion: "1.3.0",
      packageManager: "bun@1.3.0",
    },
    dependencies: {
      claudeAgentSdk: "^0.2.71",
      codexSdk: "^0.112.0",
    },
    commands: [
      {
        id: "deterministic-tests",
        label: "Deterministic ingest audit tests",
        command: ["bun", "test"],
        status: "passed",
        exitCode: 0,
        durationMs: 1200,
        stdoutPath: "/tmp/tests.stdout.txt",
        stderrPath: "/tmp/tests.stderr.txt",
        reporterPath: "/tmp/tests.xml",
      },
    ],
    coverage: null,
    scenarios,
    confirmedRegressions: [],
    unsupportedButObserved: [],
    intentionallyUnasserted: createIntentionallyUnassertedFindings(scenarios),
  });

  const rendered = renderTextReport(report);

  expect(rendered).toContain("Ingest Audit: PASSED");
  expect(rendered).toContain("JSON report: /tmp/report.json");
  expect(rendered).toContain("Intentionally Unasserted:");
  expect(rendered).toContain("live-codex-replay-parity");
});

function createTempRepoRoot(): string {
  const repoRoot = join(
    tmpdir(),
    `claudex-ingest-audit-repo-${crypto.randomUUID()}`,
  );

  mkdirSync(join(repoRoot, "test", "fixtures", "codex"), { recursive: true });
  return repoRoot;
}

function writeLiveFixtureSidecar(
  repoRoot: string,
  relativePath: string,
  overrides: {
    scenarioId: string;
    provider: string;
    sourceFamilies: string[];
  },
): void {
  const filePath = join(repoRoot, relativePath);
  const sidecar = {
    scenarioId: overrides.scenarioId,
    provider: overrides.provider,
    sourceFamilies: overrides.sourceFamilies,
    capturedAt: "2026-04-11T11:02:03.000Z",
    captureKind: "sanitized-live-transcript-excerpt",
    artifactVersion: "fixture-artifact",
    providerVersion: "fixture-provider-version",
    sdkVersion: "not-recorded",
    sanitizerVersion: "test-sanitizer",
    sanitizedBy: "audit-report-test",
  };

  writeFileSync(filePath, JSON.stringify(sidecar, null, 2));
}
