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
  writeConsumerProject,
} from "./consumer-workspace.js";
import {
  verifyCodexReadinessFallback,
  verifyPackageImports,
  verifyUnsupportedFeatureContract,
} from "./smoke-checks.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export async function runPackageCheck() {
  const packageName = readPackageName(repoRoot);
  const tempRoot = mkdtempSync(join(tmpdir(), "claudex-package-check-"));

  try {
    const workspace = createConsumerWorkspace(tempRoot);
    const tarballPath = packArtifact(workspace.packDir, repoRoot);

    writeConsumerProject(workspace.consumerDir, packageName);
    installPackedArtifact(tarballPath, workspace.consumerDir);

    verifyPackageImports(workspace.consumerDir, packageName);
    verifyCodexReadinessFallback(workspace.consumerDir, packageName);
    verifyUnsupportedFeatureContract(workspace.consumerDir, packageName);
    verifyStrictConsumerTypecheck(workspace.consumerDir, repoRoot);

    console.log(`Packed artifact smoke passed for ${packageName}.`);
  } finally {
    rmSync(tempRoot, { force: true, recursive: true });
  }
}

function readPackageName(repoRoot) {
  const packageJson = readJson(resolve(repoRoot, "package.json"));

  if (!packageJson.name || typeof packageJson.name !== "string") {
    throw new Error("Expected package.json to define a string package name.");
  }

  return packageJson.name;
}
