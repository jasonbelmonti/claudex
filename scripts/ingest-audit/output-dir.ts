import { mkdirSync, rmSync } from "node:fs";
import { isAbsolute, parse, relative, resolve } from "node:path";

export function prepareAuditOutputDir(
  repoRoot: string,
  outputDir: string,
  coverageDir: string,
): void {
  assertSafeAuditOutputDir(repoRoot, outputDir);
  rmSync(outputDir, { force: true, recursive: true });
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(coverageDir, { recursive: true });
}

function assertSafeAuditOutputDir(repoRoot: string, outputDir: string): void {
  const normalizedRepoRoot = resolve(repoRoot);
  const safeOutputRoot = resolve(normalizedRepoRoot, "out");
  const normalizedOutputDir = resolve(outputDir);
  const filesystemRoot = parse(normalizedOutputDir).root;
  const outputDirRelativeToSafeRoot = relative(
    safeOutputRoot,
    normalizedOutputDir,
  );

  if (normalizedOutputDir === filesystemRoot) {
    throw new Error(
      `Refusing to clean audit output directory at filesystem root: ${normalizedOutputDir}`,
    );
  }

  if (
    outputDirRelativeToSafeRoot === "" ||
    outputDirRelativeToSafeRoot === "." ||
    outputDirRelativeToSafeRoot.startsWith("..") ||
    isAbsolute(outputDirRelativeToSafeRoot)
  ) {
    throw new Error(
      `Refusing to clean audit output directory outside a safe audit output subtree: ${normalizedOutputDir}`,
    );
  }
}
