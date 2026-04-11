import { mkdirSync, rmSync } from "node:fs";

export function prepareAuditOutputDir(
  outputDir: string,
  coverageDir: string,
): void {
  rmSync(outputDir, { force: true, recursive: true });
  mkdirSync(outputDir, { recursive: true });
  mkdirSync(coverageDir, { recursive: true });
}
