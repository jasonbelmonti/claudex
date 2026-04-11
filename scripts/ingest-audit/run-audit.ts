import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { createDeterministicAuditEnv } from "./deterministic-env";
import { prepareAuditOutputDir } from "./output-dir";
import {
  buildAuditReport,
  parseCoverageSummary,
  parseFailedFilesFromJunit,
  renderTextReport,
} from "./report-generator";
import {
  createConfirmedRegressionFindings,
  createIntentionallyUnassertedFindings,
  createScenarioSummaries,
  createUnsupportedObservedFindings,
  type IngestAuditCommandResult,
} from "./report-contract";

const repoRoot = resolve(import.meta.dir, "..", "..");

const options = parseArgs(Bun.argv.slice(2));
const outputDir = resolve(repoRoot, options.outputDir ?? "out/ingest-audit");
const coverageDir = resolve(outputDir, "coverage");
const junitPath = resolve(outputDir, "deterministic.junit.xml");
const jsonPath = resolve(outputDir, options.jsonOut ?? "report.json");
const textPath = resolve(outputDir, options.textOut ?? "report.txt");

prepareAuditOutputDir(repoRoot, outputDir, coverageDir);

const packageJson = await Bun.file(resolve(repoRoot, "package.json")).json();
const generatedAt = new Date().toISOString();
const scenarios = await createScenarioSummaries(repoRoot);

const deterministicCommand = await runCommand({
  id: "deterministic-tests",
  label: "Deterministic ingest audit tests",
  command: [
    process.execPath,
    "test",
    "test/ingest",
    "test/ingest-public-api.test.ts",
    "--reporter=junit",
    `--reporter-outfile=${junitPath}`,
  ],
  outputDir,
});

const coverageCommand = await runCommand({
  id: "deterministic-coverage",
  label: "Deterministic ingest audit coverage",
  command: [
    process.execPath,
    "test",
    "--coverage",
    "--coverage-reporter=text",
    "--coverage-reporter=lcov",
    `--coverage-dir=${coverageDir}`,
    "test/ingest",
    "test/ingest-public-api.test.ts",
  ],
  outputDir,
});

const commands = [deterministicCommand, coverageCommand] as const;
const junitXml = await readOptionalText(junitPath);
const failedCoverageFiles =
  junitXml === null ? [] : parseFailedFilesFromJunit(junitXml);
const confirmedRegressions = createConfirmedRegressionFindings({
  failedCoverageFiles,
  failedCommandIds: commands
    .filter((command) => command.status === "failed")
    .map((command) => command.id),
});
const unsupportedButObserved = createUnsupportedObservedFindings(scenarios);
const intentionallyUnasserted = createIntentionallyUnassertedFindings(scenarios);
const coverage = parseCoverageSummary(join(coverageDir, "lcov.info"));

const report = buildAuditReport({
  generatedAt,
  jsonPath,
  textPath,
  repository: {
    root: repoRoot,
    packageName:
      typeof packageJson.name === "string" ? packageJson.name : "unknown-package",
    packageVersion:
      typeof packageJson.version === "string" ? packageJson.version : "0.0.0",
    git: {
      branch: await runGitCommand(["branch", "--show-current"]),
      commitSha: await runGitCommand(["rev-parse", "HEAD"]),
      dirty: (await runGitCommand(["status", "--short"])) !== "",
    },
  },
  runtime: {
    bunVersion: Bun.version,
    packageManager:
      typeof packageJson.packageManager === "string"
        ? packageJson.packageManager
        : null,
  },
  dependencies: {
    claudeAgentSdk: readDependencyVersion(
      packageJson,
      "@anthropic-ai/claude-agent-sdk",
    ),
    codexSdk: readDependencyVersion(packageJson, "@openai/codex-sdk"),
  },
  commands,
  coverage,
  scenarios,
  confirmedRegressions,
  unsupportedButObserved,
  intentionallyUnasserted,
});

const textReport = renderTextReport(report);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(textPath, textReport);
process.stdout.write(textReport);
process.exit(report.summary.status === "passed" ? 0 : 1);

type RunCommandInput = {
  id: string;
  label: string;
  command: string[];
  outputDir: string;
};

function parseArgs(argv: readonly string[]): {
  outputDir?: string;
  jsonOut?: string;
  textOut?: string;
} {
  const options: {
    outputDir?: string;
    jsonOut?: string;
    textOut?: string;
  } = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === "--output-dir" && nextValue) {
      options.outputDir = nextValue;
      index += 1;
      continue;
    }

    if (argument === "--json-out" && nextValue) {
      options.jsonOut = nextValue;
      index += 1;
      continue;
    }

    if (argument === "--text-out" && nextValue) {
      options.textOut = nextValue;
      index += 1;
    }
  }

  return options;
}

async function runCommand(input: RunCommandInput): Promise<IngestAuditCommandResult> {
  const startedAt = performance.now();
  const result = Bun.spawnSync({
    cmd: input.command,
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: createDeterministicAuditEnv(Bun.env),
  });
  const durationMs = Math.round(performance.now() - startedAt);
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  const stdoutPath = resolve(input.outputDir, `${input.id}.stdout.txt`);
  const stderrPath = resolve(input.outputDir, `${input.id}.stderr.txt`);

  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);

  return {
    id: input.id,
    label: input.label,
    command: input.command,
    status: result.exitCode === 0 ? "passed" : "failed",
    exitCode: result.exitCode ?? 1,
    durationMs,
    stdoutPath,
    stderrPath,
    reporterPath: input.id === "deterministic-tests" ? junitPath : undefined,
  };
}

async function readOptionalText(filePath: string): Promise<string | null> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  return file.text();
}

async function runGitCommand(args: string[]): Promise<string | null> {
  const result = Bun.spawnSync({
    cmd: ["git", ...args],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "ignore",
    env: Bun.env,
  });

  if (result.exitCode !== 0) {
    return null;
  }

  return result.stdout.toString().trim();
}

function readDependencyVersion(
  packageJson: Record<string, unknown>,
  dependencyName: string,
): string | null {
  const dependencies = packageJson.dependencies;

  if (
    typeof dependencies !== "object" ||
    dependencies === null ||
    !(dependencyName in dependencies)
  ) {
    return null;
  }

  const version = (dependencies as Record<string, unknown>)[dependencyName];
  return typeof version === "string" ? version : null;
}
