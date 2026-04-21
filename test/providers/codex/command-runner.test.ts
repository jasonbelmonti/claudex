import { expect, test } from "bun:test";

import {
  requiresShell,
  runCodexCommand,
} from "../../../src/providers/codex/command-runner.js";

test("runCodexCommand trims output and preserves exit codes", async () => {
  const result = await runCodexCommand(process.execPath, [
    "--input-type=module",
    "-e",
    [
      "console.log('  hello from stdout  ');",
      "console.error('  hello from stderr  ');",
      "process.exit(7);",
    ].join("\n"),
  ]);

  expect(result).toEqual({
    exitCode: 7,
    stdout: "hello from stdout",
    stderr: "hello from stderr",
  });
});

test("requiresShell only enables shell execution for Windows batch shims", () => {
  expect(requiresShell("codex.cmd", "win32")).toBe(true);
  expect(requiresShell("codex.BAT", "win32")).toBe(true);
  expect(requiresShell("codex.exe", "win32")).toBe(false);
  expect(requiresShell("/usr/local/bin/codex", "linux")).toBe(false);
});
