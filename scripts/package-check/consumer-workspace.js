import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { run, writeJson } from "./command-runner.js";

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

export function writeConsumerProject(consumerDir, packageName) {
  writeJson(join(consumerDir, "package.json"), {
    name: "claudex-package-check-consumer",
    private: true,
    type: "module",
  });

  writeJson(join(consumerDir, "tsconfig.json"), {
    compilerOptions: {
      target: "ESNext",
      module: "Preserve",
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: false,
      noEmit: true,
    },
  });

  writeFileSync(
    join(consumerDir, "index.ts"),
    [
      `import { ClaudexAdapter, type ClaudexAdapterOptions } from ${JSON.stringify(packageName)};`,
      "",
      "const options: ClaudexAdapterOptions = {",
      '  preferredProviders: ["codex", "claude"],',
      "  claude: {},",
      "  codex: {},",
      "};",
      "",
      "const adapter = new ClaudexAdapter(options);",
      "void adapter;",
      "",
    ].join("\n"),
  );
}

export function installPackedArtifact(tarballPath, consumerDir) {
  run(
    ["npm", "install", "--ignore-scripts", "--no-package-lock", tarballPath],
    consumerDir,
  );
}

export function verifyStrictConsumerTypecheck(consumerDir, repoRoot) {
  run(
    [
      "npm",
      "exec",
      "--prefix",
      repoRoot,
      "tsc",
      "--",
      "--project",
      join(consumerDir, "tsconfig.json"),
    ],
    repoRoot,
  );
}
