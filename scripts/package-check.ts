import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

type PackageManifest = {
  name: string;
};

const repoRoot = resolve(import.meta.dir, "..");
const packageJson = (await Bun.file(resolve(repoRoot, "package.json")).json()) as PackageManifest;

const tempRoot = mkdtempSync(join(tmpdir(), "claudex-package-check-"));

try {
  const packDir = join(tempRoot, "pack");
  const consumerDir = join(tempRoot, "consumer");

  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  run(["npm", "pack", "--pack-destination", packDir], repoRoot);

  const [filename] = readdirSync(packDir).filter((entry) => entry.endsWith(".tgz"));

  if (!filename) {
    throw new Error("npm pack did not produce a tarball.");
  }

  const tarballPath = join(packDir, filename);

  await Bun.write(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "claudex-package-check-consumer",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );

  run(
    ["npm", "install", "--ignore-scripts", "--no-package-lock", tarballPath],
    consumerDir,
  );

  smokeImport(
    "bun",
    ["--eval", "await import('@jasonbelmonti/claudex'); await import('@jasonbelmonti/claudex/ingest');"],
    consumerDir,
  );
  smokeImport(
    "node",
    ["--input-type=module", "-e", "await import('@jasonbelmonti/claudex'); await import('@jasonbelmonti/claudex/ingest');"],
    consumerDir,
  );
  smokeImport(
    "node",
    [
      "--input-type=module",
      "-e",
      [
        "globalThis.Bun ??= {",
        "  which: () => null,",
        "  file: () => ({ exists: async () => false }),",
        "};",
        `const { ClaudexAdapter } = await import(${JSON.stringify(packageJson.name)});`,
        `await import(${JSON.stringify(`${packageJson.name}/ingest`)});`,
        "const readiness = await new ClaudexAdapter({ preferredProviders: ['codex'] }).checkReadiness();",
        "if (readiness.provider !== 'codex' || readiness.status !== 'missing_cli') {",
        "  throw new Error(`Unexpected readiness result: ${JSON.stringify(readiness)}`);",
        "}",
      ].join("\n"),
    ],
    consumerDir,
  );

  console.log(`Packed artifact smoke passed for ${packageJson.name}.`);
} finally {
  rmSync(tempRoot, { force: true, recursive: true });
}

function smokeImport(command: string, args: string[], cwd: string): void {
  run([command, ...args], cwd);
}

function run(command: string[], cwd: string) {
  const result = Bun.spawnSync(command, {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });

  if (result.exitCode !== 0) {
    const stderr = result.stderr.toString().trim();
    const stdout = result.stdout.toString().trim();
    const output = [stdout, stderr].filter(Boolean).join("\n");
    throw new Error(
      `Command failed (${command.join(" ")}):\n${output || "No output"}`,
    );
  }

  return result;
}
