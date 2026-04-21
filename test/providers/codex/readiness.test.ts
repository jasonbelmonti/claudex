import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { expect, test } from "bun:test";

import { CodexAdapter } from "../../../src/providers/codex/adapter.js";
import {
  isCodexPathOverride,
  resolveCodexBinary,
} from "../../../src/providers/codex/readiness.js";
import type { CodexCommandRunner } from "../../../src/providers/codex/types.js";

test("checkReadiness reports ready when CLI and login probes succeed", async () => {
  const runner: CodexCommandRunner = async (_command, args) => {
    if (args[0] === "--version") {
      return {
        exitCode: 0,
        stdout: "codex-cli 0.103.0",
        stderr: "",
      };
    }

    return {
      exitCode: 0,
      stdout: "Logged in using ChatGPT",
      stderr: "",
    };
  };
  const adapter = new CodexAdapter({
    commandRunner: runner,
    binaryResolver: async () => "/mock/bin/codex",
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("ready");
  expect(readiness.capabilities.providerVersion).toBe("0.103.0");
  expect(readiness.checks.map((check) => check.status)).toEqual(["pass", "pass"]);
});

test("checkReadiness reports missing_cli when no Codex binary is available", async () => {
  const adapter = new CodexAdapter({
    binaryResolver: async () => null,
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("missing_cli");
  expect(readiness.checks[0]?.kind).toBe("cli");
});

test("checkReadiness reports needs_auth when login status is not authenticated", async () => {
  const runner: CodexCommandRunner = async (_command, args) => {
    if (args[0] === "--version") {
      return {
        exitCode: 0,
        stdout: "codex-cli 0.103.0",
        stderr: "",
      };
    }

    return {
      exitCode: 1,
      stdout: "",
      stderr: "Not logged in",
    };
  };
  const adapter = new CodexAdapter({
    commandRunner: runner,
    binaryResolver: async () => "/mock/bin/codex",
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("needs_auth");
  expect(readiness.checks[1]?.status).toBe("fail");
});

test("checkReadiness prefers needs_auth when the auth probe says not logged in", async () => {
  const runner: CodexCommandRunner = async (_command, args) => {
    if (args[0] === "--version") {
      return {
        exitCode: 0,
        stdout: "codex-cli 0.103.0",
        stderr: "",
      };
    }

    return {
      exitCode: 0,
      stdout: "Not logged in",
      stderr: "",
    };
  };
  const adapter = new CodexAdapter({
    commandRunner: runner,
    binaryResolver: async () => "/mock/bin/codex",
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("needs_auth");
  expect(readiness.checks[1]?.summary).toBe("Codex CLI needs login");
});

test("isCodexPathOverride recognizes Windows-style override paths", () => {
  expect(isCodexPathOverride("C:\\tools\\codex.exe")).toBe(true);
  expect(isCodexPathOverride("./bin/codex")).toBe(true);
  expect(isCodexPathOverride("/usr/local/bin/codex")).toBe(true);
  expect(isCodexPathOverride("codex")).toBe(false);
});

test("resolveCodexBinary accepts existing override paths", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "claudex-codex-"));
  const binaryPath = join(tempDir, "codex");

  try {
    writeFileSync(binaryPath, "#!/bin/sh\nexit 0\n");
    chmodSync(binaryPath, 0o755);

    await expect(
      resolveCodexBinary({ codexPathOverride: binaryPath }),
    ).resolves.toBe(binaryPath);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveCodexBinary resolves named overrides from PATH", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "claudex-codex-path-"));
  const binaryName = "mock-codex";
  const binaryPath = join(tempDir, binaryName);
  const previousPath = process.env.PATH;

  try {
    writeFileSync(binaryPath, "#!/bin/sh\nexit 0\n");
    chmodSync(binaryPath, 0o755);
    process.env.PATH = [tempDir, previousPath].filter(Boolean).join(delimiter);

    await expect(
      resolveCodexBinary({ codexPathOverride: binaryName }),
    ).resolves.toBe(binaryPath);
  } finally {
    process.env.PATH = previousPath;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolveCodexBinary ignores PATH directories that share the command name", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "claudex-codex-dir-"));
  const binaryName = "mock-codex";
  const binaryPath = join(tempDir, binaryName);
  const previousPath = process.env.PATH;

  try {
    mkdirSync(binaryPath);
    process.env.PATH = [tempDir, previousPath].filter(Boolean).join(delimiter);

    await expect(
      resolveCodexBinary({ codexPathOverride: binaryName }),
    ).resolves.toBeNull();
  } finally {
    process.env.PATH = previousPath;
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("checkReadiness reports error when CLI detection throws", async () => {
  const adapter = new CodexAdapter({
    binaryResolver: async () => {
      throw new Error("spawn EACCES");
    },
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("error");
  expect(readiness.checks[0]?.summary).toBe("Codex CLI detection failed");
});

test("checkReadiness reports error when auth probe throws", async () => {
  const runner: CodexCommandRunner = async (_command, args) => {
    if (args[0] === "--version") {
      return {
        exitCode: 0,
        stdout: "codex-cli 0.103.0",
        stderr: "",
      };
    }

    throw new Error("permission denied");
  };
  const adapter = new CodexAdapter({
    commandRunner: runner,
    binaryResolver: async () => "/mock/bin/codex",
  });

  const readiness = await adapter.checkReadiness();

  expect(readiness.status).toBe("error");
  expect(readiness.checks.map((check) => check.summary)).toEqual([
    "Codex CLI detected",
    "Codex CLI auth probe failed",
  ]);
});
