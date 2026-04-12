import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const repoInstallRoot = resolveRepoInstallRoot();
const tscPath = join(repoInstallRoot, "node_modules", ".bin", "tsc");
const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((workspace) => removeWorkspace(workspace)));
});

test("packed root package passes strict consumer type-checking", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "claudex-package-smoke-"));
  workspaces.push(workspace);

  const packDir = join(workspace, "pack");
  const consumerDir = join(workspace, "consumer");
  await mkdir(packDir, { recursive: true });
  await mkdir(consumerDir, { recursive: true });

  const packResult = runCommand({
    cmd: ["npm", "pack", "--silent", "--pack-destination", packDir],
    cwd: repoRoot,
  });
  const tarballName = packResult.stdout.trim().split(/\r?\n/).filter(Boolean).at(-1);

  if (!tarballName) {
    throw new Error(`npm pack did not report a tarball name.\nstdout:\n${packResult.stdout}`);
  }

  await Bun.write(
    join(consumerDir, "package.json"),
    JSON.stringify(
      {
        name: "claudex-consumer-smoke",
        private: true,
        type: "module",
      },
      null,
      2,
    ),
  );
  await Bun.write(
    join(consumerDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ESNext",
          module: "Preserve",
          moduleResolution: "bundler",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
        },
      },
      null,
      2,
    ),
  );
  await Bun.write(
    join(consumerDir, "index.ts"),
    [
      'import { ClaudexAdapter, type ClaudexAdapterOptions } from "@jasonbelmonti/claudex";',
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

  runCommand({
    cmd: ["bun", "add", "--offline", join(packDir, tarballName)],
    cwd: consumerDir,
  });

  runCommand({
    cmd: [tscPath, "--project", join(consumerDir, "tsconfig.json")],
    cwd: consumerDir,
  });
});

function resolveRepoInstallRoot(): string {
  const result = Bun.spawnSync({
    cmd: ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
    cwd: repoRoot,
    stdout: "pipe",
    stderr: "pipe",
    env: Bun.env,
  });

  const gitCommonDir = result.stdout.toString().trim();
  const installRoot =
    result.exitCode === 0 && gitCommonDir
      ? dirname(gitCommonDir)
      : repoRoot;

  if (!existsSync(join(installRoot, "node_modules", ".bin", "tsc"))) {
    throw new Error(
      `Expected a repo-pinned TypeScript CLI at ${join(installRoot, "node_modules", ".bin", "tsc")}. Run bun install before package smoke tests.`,
    );
  }

  return installRoot;
}

function runCommand(input: {
  cmd: string[];
  cwd: string;
}): {
  exitCode: number;
  stdout: string;
  stderr: string;
} {
  const result = Bun.spawnSync({
    cmd: input.cmd,
    cwd: input.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: Bun.env,
  });
  const stdout = result.stdout.toString();
  const stderr = result.stderr.toString();
  const exitCode = result.exitCode ?? 1;

  if (exitCode !== 0) {
    throw new Error(
      [
        `Command failed: ${input.cmd.join(" ")}`,
        `cwd: ${input.cwd}`,
        `exitCode: ${exitCode}`,
        "",
        "stdout:",
        stdout,
        "",
        "stderr:",
        stderr,
      ].join("\n"),
    );
  }

  return {
    exitCode,
    stdout,
    stderr,
  };
}

async function removeWorkspace(workspace: string): Promise<void> {
  await rm(workspace, { recursive: true, force: true });
}
