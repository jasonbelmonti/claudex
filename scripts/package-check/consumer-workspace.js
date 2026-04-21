import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { run, runAndCapture } from "./command-runner.js";

export function createConsumerWorkspace(rootDir) {
  const packDir = join(rootDir, "pack");
  const consumerDir = join(rootDir, "consumer");

  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  return { consumerDir, packDir };
}

export function packArtifact(packDir, repoRoot) {
  run(["npm", "pack", "--pack-destination", packDir], repoRoot);

  const [tarballName] = readdirSync(packDir).filter((entry) => entry.endsWith(".tgz"));

  if (!tarballName) {
    throw new Error("npm pack did not produce a tarball.");
  }

  return join(packDir, tarballName);
}

export function installPackedArtifact(tarballPath, consumerDir) {
  run(
    ["npm", "install", "--ignore-scripts", "--no-package-lock", tarballPath],
    consumerDir,
  );
}

export function verifyStrictConsumerTypecheck(consumerDir, repoRoot) {
  const installRoot = resolveTypeScriptInstallRoot(repoRoot);

  run(
    [
      "npm",
      "exec",
      "--prefix",
      installRoot,
      "tsc",
      "--",
      "--project",
      join(consumerDir, "tsconfig.json"),
    ],
    installRoot,
  );
}

function resolveTypeScriptInstallRoot(repoRoot) {
  if (hasPinnedTypeScript(repoRoot)) {
    return repoRoot;
  }

  const commonRoot = resolveCommonRoot(repoRoot);

  if (commonRoot && hasPinnedTypeScript(commonRoot)) {
    return commonRoot;
  }

  return repoRoot;
}

function resolveCommonRoot(repoRoot) {
  try {
    const gitCommonDir = runAndCapture(
      ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
      repoRoot,
    ).trim();

    return gitCommonDir ? dirname(gitCommonDir) : null;
  } catch {
    return null;
  }
}

function hasPinnedTypeScript(rootDir) {
  return existsSync(join(rootDir, "node_modules", ".bin", "tsc"));
}
