import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readJson } from "./command-runner.js";
import {
  createConsumerWorkspace,
  installPackedArtifact,
  packArtifact,
  verifyStrictConsumerTypecheck,
} from "./consumer-workspace.js";
import { writeConsumerProject } from "./consumer-project.js";
import {
  verifyCodexReadinessFallback,
  verifyPackageImports,
  verifyUnsupportedFeatureContract,
} from "./smoke-checks.js";

const PACKAGE_CHECK_TMP_PREFIX = "claudex-package-check-";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function runPackageCheck() {
  const packageName = readPackageName(repoRoot);
  const tempRoot = mkdtempSync(join(tmpdir(), PACKAGE_CHECK_TMP_PREFIX));

  try {
    const { consumerDir, packDir } = createConsumerWorkspace(tempRoot);
    const tarballPath = packArtifact(packDir, repoRoot);

    writeConsumerProject(consumerDir, packageName);
    installPackedArtifact(tarballPath, consumerDir);

    verifyPackageImports(consumerDir, packageName);
    verifyCodexReadinessFallback(consumerDir, packageName);
    verifyUnsupportedFeatureContract(consumerDir, packageName);
    verifyStrictConsumerTypecheck(consumerDir, repoRoot);

    console.log(`Packed artifact smoke passed for ${packageName}.`);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

function readPackageName(repoRoot) {
  const { name } = readJson(resolve(repoRoot, "package.json"));

  if (typeof name !== "string") {
    throw new Error("Expected package.json to define a string package name.");
  }

  return name;
}
