import { expect, test } from "#test-support";

import {
  formatSpawnCommand,
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

test("formatSpawnCommand quotes Windows batch shims for shell execution", () => {
  expect(formatSpawnCommand("C:\\Users\\Test User\\AppData\\codex.cmd", "win32"))
    .toBe('"C:\\Users\\Test User\\AppData\\codex.cmd"');
  expect(formatSpawnCommand("codex.bat", "win32")).toBe('"codex.bat"');
  expect(formatSpawnCommand("codex.exe", "win32")).toBe("codex.exe");
  expect(formatSpawnCommand("/usr/local/bin/codex", "linux")).toBe(
    "/usr/local/bin/codex",
  );
});
