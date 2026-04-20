import type { CodexCommandResult, CodexCommandRunner } from "./types.js";

export const runCodexCommand: CodexCommandRunner = async (
  command,
  args,
): Promise<CodexCommandResult> => {
  const child = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  return {
    exitCode,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
  };
};
