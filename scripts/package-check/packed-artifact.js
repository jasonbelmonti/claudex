import { join } from "node:path";

import { runAndCapture } from "./command-runner.js";

export function packArtifact(packDir, repoRoot) {
  const packOutput = runAndCapture(
    ["npm", "pack", "--json", "--pack-destination", packDir],
    repoRoot,
  );
  const packResult = parsePackResult(packOutput);
  const [artifact] = Array.isArray(packResult) ? packResult : [];

  if (!artifact?.filename) {
    throw new Error("npm pack did not produce a tarball.");
  }

  return {
    tarballPath: join(packDir, artifact.filename),
    artifactFiles: readArtifactFiles(artifact.files),
  };
}

export function verifyArtifactHasNoSourceFiles(artifactFiles) {
  const sourceEntries = artifactFiles.filter(isSourceArtifactPath);

  if (sourceEntries.length > 0) {
    throw new Error(
      `Packed artifact unexpectedly includes source files:\n${sourceEntries.join("\n")}`,
    );
  }
}

function readArtifactFiles(files) {
  if (!Array.isArray(files)) {
    throw new Error("npm pack did not report packaged file metadata.");
  }

  return files
    .map((entry) => (entry && typeof entry.path === "string" ? entry.path : null))
    .filter((entry) => entry !== null);
}

function parsePackResult(output) {
  const jsonStart = output.lastIndexOf("\n[");
  const jsonText = (jsonStart >= 0 ? output.slice(jsonStart + 1) : output).trim();

  return JSON.parse(jsonText);
}

function isSourceArtifactPath(filePath) {
  return filePath === "src" || filePath.startsWith("src/");
}
