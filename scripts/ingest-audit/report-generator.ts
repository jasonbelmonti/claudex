import { readFileSync } from "node:fs";

import {
  createAuditReport,
  type IngestAuditCommandResult,
  type IngestAuditCoverageSummary,
  type IngestAuditFinding,
  type IngestAuditReport,
  type IngestAuditScenarioSummary,
} from "./report-contract.js";

export function parseCoverageSummary(lcovPath: string): IngestAuditCoverageSummary | null {
  let rawCoverage: string;

  try {
    rawCoverage = readFileSync(lcovPath, "utf8");
  } catch {
    return null;
  }

  const totals = {
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
  };

  for (const line of rawCoverage.split(/\r?\n/u)) {
    if (line.startsWith("LF:")) {
      totals.linesFound += Number.parseInt(line.slice(3), 10);
      continue;
    }

    if (line.startsWith("LH:")) {
      totals.linesHit += Number.parseInt(line.slice(3), 10);
      continue;
    }

    if (line.startsWith("FNF:")) {
      totals.functionsFound += Number.parseInt(line.slice(4), 10);
      continue;
    }

    if (line.startsWith("FNH:")) {
      totals.functionsHit += Number.parseInt(line.slice(4), 10);
    }
  }

  if (totals.linesFound === 0 && totals.functionsFound === 0) {
    return null;
  }

  return {
    lines: {
      covered: totals.linesHit,
      found: totals.linesFound,
      pct: computePct(totals.linesHit, totals.linesFound),
    },
    functions: {
      covered: totals.functionsHit,
      found: totals.functionsFound,
      pct: computePct(totals.functionsHit, totals.functionsFound),
    },
  };
}

export function parseFailedFilesFromJunit(
  junitXml: string,
): readonly string[] {
  const failedFiles = new Set<string>();
  const testsuitePattern = /<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/gu;

  for (const testsuiteMatch of junitXml.matchAll(testsuitePattern)) {
    const testsuiteAttributes = parseXmlAttributes(testsuiteMatch[1] ?? "");
    const testsuiteInner = testsuiteMatch[2] ?? "";
    const testsuiteCandidates = extractCandidateFiles(testsuiteAttributes);
    const testcasePattern =
      /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gu;
    let sawFailedTestcase = false;

    for (const testcaseMatch of testsuiteInner.matchAll(testcasePattern)) {
      const testcaseAttributes = parseXmlAttributes(testcaseMatch[1] ?? "");
      const testcaseInner = testcaseMatch[2] ?? "";
      const failed =
        testcaseInner.includes("<failure") || testcaseInner.includes("<error");

      if (!failed) {
        continue;
      }

      sawFailedTestcase = true;

      for (const candidate of [
        ...testsuiteCandidates,
        ...extractCandidateFiles(testcaseAttributes),
      ]) {
        failedFiles.add(candidate);
      }
    }

    const suiteFailed =
      attributeIndicatesFailure(testsuiteAttributes.failures) ||
      attributeIndicatesFailure(testsuiteAttributes.errors);

    if (suiteFailed && !sawFailedTestcase) {
      for (const candidate of testsuiteCandidates) {
        failedFiles.add(candidate);
      }
    }
  }

  return [...failedFiles].sort();
}

export function renderTextReport(report: IngestAuditReport): string {
  const lines = [
    `Ingest Audit: ${report.summary.status.toUpperCase()}`,
    `Generated: ${report.generatedAt}`,
    `Entrypoint: bun run ${report.entrypoint.script}`,
    `JSON report: ${report.entrypoint.jsonPath}`,
    `Text report: ${report.entrypoint.textPath}`,
    `Repository: ${report.repository.packageName}@${report.repository.packageVersion}`,
    `Git: ${formatGitSummary(report)}`,
    `Bun: ${report.runtime.bunVersion}`,
    `Dependencies: Claude SDK ${report.dependencies.claudeAgentSdk ?? "unknown"}, Codex SDK ${report.dependencies.codexSdk ?? "unknown"}`,
    `Commands: ${report.commands.filter((command) => command.status === "passed").length}/${report.commands.length} passed`,
    `Scenarios: ${report.summary.deterministicScenarioCount} deterministic, ${report.summary.liveScenarioCount} live`,
    `Live parity: ${report.summary.liveReadyScenarioCount} ready, ${report.summary.livePartialScenarioCount} partial or missing`,
    `Findings: ${report.summary.confirmedRegressionCount} confirmed regressions, ${report.summary.unsupportedObservedCount} unsupported-but-observed, ${report.summary.intentionallyUnassertedCount} intentionally unasserted`,
  ];

  if (report.coverage !== null) {
    lines.push(
      `Coverage: ${report.coverage.functions.pct.toFixed(2)}% functions, ${report.coverage.lines.pct.toFixed(2)}% lines`,
    );
  }

  appendFindingSection(lines, "Confirmed Regressions", report.findings.confirmedRegressions);
  appendFindingSection(
    lines,
    "Unsupported But Observed",
    report.findings.unsupportedButObserved,
  );
  appendFindingSection(
    lines,
    "Intentionally Unasserted",
    report.findings.intentionallyUnasserted,
  );
  appendLiveParitySection(lines, report.scenarios);

  return `${lines.join("\n")}\n`;
}

export function buildAuditReport(params: {
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
  return createAuditReport({
    repoRoot: params.repository.root,
    generatedAt: params.generatedAt,
    jsonPath: params.jsonPath,
    textPath: params.textPath,
    repository: params.repository,
    runtime: params.runtime,
    dependencies: params.dependencies,
    commands: params.commands,
    coverage: params.coverage,
    scenarios: params.scenarios,
    confirmedRegressions: params.confirmedRegressions,
    unsupportedButObserved: params.unsupportedButObserved,
    intentionallyUnasserted: params.intentionallyUnasserted,
  });
}

function appendFindingSection(
  lines: string[],
  title: string,
  findings: readonly IngestAuditFinding[],
): void {
  lines.push("");
  lines.push(`${title}:`);

  if (findings.length === 0) {
    lines.push("- none");
    return;
  }

  for (const finding of findings) {
    lines.push(`- ${finding.summary}`);

    if (finding.scenarioIds.length > 0) {
      lines.push(`  scenarios: ${finding.scenarioIds.join(", ")}`);
    }

    if (finding.coveragePaths.length > 0) {
      lines.push(`  coverage: ${finding.coveragePaths.join(", ")}`);
    }

    for (const detail of finding.details) {
      lines.push(`  detail: ${detail}`);
    }
  }
}

function appendLiveParitySection(
  lines: string[],
  scenarios: readonly IngestAuditScenarioSummary[],
): void {
  const liveScenarios = scenarios.filter(
    (scenario) => scenario.probeKind === "live-capture",
  );

  lines.push("");
  lines.push("Live Parity:");

  if (liveScenarios.length === 0) {
    lines.push("- none");
    return;
  }

  for (const scenario of liveScenarios) {
    lines.push(`- ${scenario.scenarioId}: ${scenario.liveParityStatus}`);
    lines.push(
      `  current heads: ${scenario.currentHeadFixturePaths.length === 0 ? "none" : scenario.currentHeadFixturePaths.join(", ")}`,
    );
    lines.push(
      `  superseded: ${scenario.supersededFixturePaths.length === 0 ? "none" : scenario.supersededFixturePaths.join(", ")}`,
    );
  }
}

function parseXmlAttributes(rawAttributes: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const attributePattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)="([^"]*)"/gu;

  for (const match of rawAttributes.matchAll(attributePattern)) {
    const key = match[1];
    const value = match[2];

    if (key !== undefined && value !== undefined) {
      attributes[key] = value;
    }
  }

  return attributes;
}

function extractCandidateFiles(
  attributes: Record<string, string>,
): readonly string[] {
  const values = [attributes.file, attributes.classname, attributes.name]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.replaceAll("\\", "/"));

  return values.filter((value) => value.includes(".test."));
}

function computePct(covered: number, found: number): number {
  if (found === 0) {
    return 100;
  }

  return (covered / found) * 100;
}

function attributeIndicatesFailure(value: string | undefined): boolean {
  return value !== undefined && value !== "0";
}

function formatGitSummary(report: IngestAuditReport): string {
  const branch = report.repository.git.branch ?? "detached";
  const commit = report.repository.git.commitSha ?? "unknown";
  const dirtySuffix = report.repository.git.dirty ? " dirty" : " clean";
  return `${branch}@${commit}${dirtySuffix}`;
}
