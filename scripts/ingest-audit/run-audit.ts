import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDeterministicAuditEnv } from "./deterministic-env.js";
import { fileExists, readJsonFile, readTextFile } from "./file-system.js";
import { prepareAuditOutputDir } from "./output-dir.js";
import {
  buildAuditReport,
  parseCoverageSummary,
  parseFailedFilesFromJunit,
  renderTextReport,
} from "./report-generator.js";
import {
  createConfirmedRegressionFindings,
  createIntentionallyUnassertedFindings,
  createScenarioSummaries,
  createUnsupportedObservedFindings,
  type IngestAuditCommandResult,
} from "./report-contract.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const options = parseArgs(process.argv.slice(2));
const outputDir = resolve(repoRoot, options.outputDir ?? "out/ingest-audit");
const coverageDir = resolve(outputDir, "coverage");
const junitPath = resolve(outputDir, "deterministic.junit.xml");
const jsonPath = resolve(outputDir, options.jsonOut ?? "report.json");
const textPath = resolve(outputDir, options.textOut ?? "report.txt");

prepareAuditOutputDir(repoRoot, outputDir, coverageDir);

const packageJson = await readJsonFile<Record<string, unknown>>(
  resolve(repoRoot, "package.json"),
);
const generatedAt = new Date().toISOString();
const scenarios = await createScenarioSummaries(repoRoot);

const deterministicCommand = await runCommand({
  id: "deterministic-tests",
  label: "Deterministic ingest audit tests",
  command: [
    "npm",
    "exec",
    "--",
    "vitest",
    "run",
    "test/ingest",
    "test/ingest-public-api.test.ts",
    "--reporter=junit",
    `--outputFile=${junitPath}`,
  ],
  outputDir,
});

const coverageCommand = await runCommand({
  id: "deterministic-coverage",
  label: "Deterministic ingest audit coverage",
  command: [
    "npm",
    "exec",
    "--",
    "vitest",
    "run",
    "--coverage",
    "--coverage.reporter=text",
    "--coverage.reporter=lcov",
    `--coverage.reportsDirectory=${coverageDir}`,
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
    nodeVersion: process.version,
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
  const [command, ...args] = input.command;

  if (!command) {
    throw new Error(`Command ${input.id} is missing an executable.`);
  }

  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "pipe",
    env: createDeterministicAuditEnv(process.env),
  });

  if (result.error) {
    throw result.error;
  }

  const durationMs = Math.round(performance.now() - startedAt);
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const stdoutPath = resolve(input.outputDir, `${input.id}.stdout.txt`);
  const stderrPath = resolve(input.outputDir, `${input.id}.stderr.txt`);

  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);

  return {
    id: input.id,
    label: input.label,
    command: input.command,
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    durationMs,
    stdoutPath,
    stderrPath,
    reporterPath: input.id === "deterministic-tests" ? junitPath : undefined,
  };
}

async function readOptionalText(filePath: string): Promise<string | null> {
  if (!(await fileExists(filePath))) {
    return null;
  }

  return readTextFile(filePath);
}

async function runGitCommand(args: string[]): Promise<string | null> {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
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
